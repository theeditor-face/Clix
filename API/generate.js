// ═══════════════════════════════════════════════════════════════
//  CLIX — api/generate.js
//  Vercel Serverless Function
//  Handles AI generation with tiered model stacking + fallback
// ═══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';

// ─── Supabase admin client ────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── Model stack — tiered fallback system ────────────────────
// Tier order is intentional — best coding models first
// If one fails or hits quota, next is tried automatically
// Users never see this list
const MODEL_TIERS = [
  // Tier 1 — Primary (best quality, tried first)
  'qwen/qwen3-coder:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',

  // Tier 2 — Strong fallbacks
  'openai/gpt-oss-120b:free',
  'openai/gpt-oss-20b:free',
  'z-ai/glm-4.5-air:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'arcee-ai/trinity-large-preview:free',

  // Tier 3 — Final fallbacks
  'google/gemma-3-27b-it:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'minimax/minimax-m2.5:free',
  'stepfun/step-3.5-flash:free',
  'nvidia/nemotron-nano-12b-v2-vl:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',

  // Absolute last resort — OpenRouter auto-selects best available
  'openrouter/free'
];

const MODEL_TIMEOUT_MS = 12000; // 12 second timeout per model

// ─── System prompt builder ────────────────────────────────────
function buildSystemPrompt(siteType) {
  return `You are CLIX, an expert web developer AI. Generate a complete, professional, production-ready website.

SITE TYPE: ${siteType}

OUTPUT FORMAT — You MUST respond with ONLY this JSON structure, nothing else:
{
  "html": "...",
  "css": "...",
  "js": "..."
}

RULES:
- html: body content only (no <html>, <head>, <body> tags — just the inner content)
- css: complete stylesheet, mobile-first, modern design
- js: vanilla JavaScript, no frameworks needed
- Make it visually stunning, professional and complete
- Include proper animations and hover effects
- Must be fully responsive for mobile and desktop
- Add a subtle "Built with CLIX ✦" watermark in the footer
- Return ONLY valid JSON — no markdown, no explanation, no code blocks`;
}

// ─── Partial continuation prompt ─────────────────────────────
function buildContinuationPrompt(partialOutput, originalPrompt, siteType) {
  return `You are completing an interrupted website generation task.

ORIGINAL REQUEST: ${originalPrompt}
SITE TYPE: ${siteType}
PARTIAL OUTPUT SO FAR:
${partialOutput}

Continue and COMPLETE the generation. Return the full completed JSON:
{
  "html": "...",
  "css": "...",
  "js": "..."
}`;
}

// ─── Call single model ────────────────────────────────────────
async function callModel(model, messages) {
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type':  'application/json',
        'HTTP-Referer':  process.env.NEXT_PUBLIC_APP_URL || 'https://clix.app',
        'X-Title':       'CLIX'
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens:   4000,
        temperature:  0.7
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${res.status}`);
    }

    const data    = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response');

    return content;

  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ─── Parse AI response into html/css/js ──────────────────────
function parseResponse(content) {
  // Strip markdown code blocks if present
  let clean = content
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // Find JSON object
  const start = clean.indexOf('{');
  const end   = clean.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON found in response');

  clean = clean.slice(start, end + 1);
  const parsed = JSON.parse(clean);

  if (!parsed.html && !parsed.css) throw new Error('Response missing html/css fields');

  return {
    html: parsed.html || '',
    css:  parsed.css  || '',
    js:   parsed.js   || ''
  };
}

// ─── Check if output is garbage ──────────────────────────────
function isGarbage(code) {
  if (!code)            return true;
  if (code.length < 50) return true;
  // Must contain at least some HTML-like content
  if (!/[<{]/.test(code)) return true;
  return false;
}

// ─── Log abuse ────────────────────────────────────────────────
async function logAbuse(reason, ip, email = '') {
  try {
    await supabase.from('abuse_logs').insert({ reason, ip_address: ip, email });
  } catch {}
}

// ─── MAIN HANDLER ────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';

  // ── Auth verification ──────────────────────────────────────
  const { userToken, prompt, siteType = 'landing' } = req.body;

  if (!userToken) {
    await logAbuse('no_token', ip);
    return res.status(401).json({ message: 'Authentication required' });
  }

  // Verify JWT with Supabase
  const { data: { user }, error: authError } = await supabase.auth.getUser(userToken);

  if (authError || !user) {
    await logAbuse('invalid_token', ip);
    return res.status(401).json({ message: 'Invalid session. Please log in again.' });
  }

  // ── Prompt validation ──────────────────────────────────────
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ message: 'Prompt is required' });
  }

  const cleanPrompt = prompt.trim().slice(0, 1000);
  if (cleanPrompt.length < 5) {
    return res.status(400).json({ message: 'Prompt too short. Describe your site.' });
  }

  // ── Check if user is banned ────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_banned, daily_count, quota_reset_at')
    .eq('id', user.id)
    .single();

  if (profile?.is_banned) {
    return res.status(403).json({ message: 'Account suspended. Contact support.' });
  }

  // ── Server-side quota check ────────────────────────────────
  const resetAt  = new Date(profile?.quota_reset_at || 0);
  const now      = new Date();
  const isNewDay = now.toDateString() !== resetAt.toDateString();
  const dayCount = isNewDay ? 0 : (profile?.daily_count || 0);

  if (dayCount >= 3) {
    return res.status(429).json({ message: 'Daily limit reached. Come back tomorrow!' });
  }

  // ── Global cap check ──────────────────────────────────────
  const { data: globalStats } = await supabase
    .from('global_stats')
    .select('daily_count, last_reset')
    .eq('id', 1)
    .single();

  const globalReset  = new Date(globalStats?.last_reset || 0);
  const globalNewDay = now.toDateString() !== globalReset.toDateString();
  const globalCount  = globalNewDay ? 0 : (globalStats?.daily_count || 0);

  if (globalCount >= 3000) {
    return res.status(503).json({ message: 'CLIX is fully booked for today. We reset at midnight!' });
  }

  // ── Model stacking loop ────────────────────────────────────
  const systemPrompt = buildSystemPrompt(siteType);
  const messages     = [
    { role: 'system',  content: systemPrompt },
    { role: 'user',    content: `Build me: ${cleanPrompt}` }
  ];

  let lastError     = null;
  let partialOutput = '';
  let modelUsed     = '';

  for (const model of MODEL_TIERS) {
    try {
      // If we have partial output from a previous failed model, use continuation prompt
      const activeMessages = partialOutput
        ? [
            { role: 'system', content: buildContinuationPrompt(partialOutput, cleanPrompt, siteType) },
            { role: 'user',   content: 'Complete the generation.' }
          ]
        : messages;

      const content = await callModel(model, activeMessages);

      // Try to parse response
      const parsed = parseResponse(content);

      // Check for garbage output
      if (isGarbage(parsed.html)) {
        partialOutput = content; // Save for continuation attempt
        throw new Error('Output quality too low');
      }

      modelUsed = model;

      // Log to admin_logs
      await supabase.from('admin_logs').insert({
        action:       'generation_success',
        performed_by: user.email,
        target_user:  user.id,
        details:      JSON.stringify({ model, siteType, promptLength: cleanPrompt.length })
      }).catch(() => {});

      return res.status(200).json({
        html:      parsed.html,
        css:       parsed.css,
        js:        parsed.js,
        modelUsed: model
      });

    } catch (err) {
      lastError = err;
      console.warn(`Model ${model} failed:`, err.message);
      // Continue to next model
      continue;
    }
  }

  // All models failed
  await supabase.from('admin_logs').insert({
    action:       'generation_all_models_failed',
    performed_by: user.email,
    target_user:  user.id,
    details:      JSON.stringify({ lastError: lastError?.message, siteType })
  }).catch(() => {});

  return res.status(503).json({
    message: 'All AI models are currently at capacity. Please try again in a few minutes.'
  });
}
