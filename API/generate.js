// ═══════════════════════════════════════════════════════════════
//  CLIX — api/generate.js
//  Vercel Serverless Function — Real streaming response
//  Tiered AI model fallback — FREE OpenRouter models only
// ═══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Model stack (verified free on OpenRouter March 2026) ────────
const MODELS = [
  // Tier 1 — Best coding quality
  'qwen/qwen3-coder:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
  // Tier 2 — Strong fallbacks
  'openai/gpt-oss-120b:free',
  'openai/gpt-oss-20b:free',
  'z-ai/glm-4.5-air:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'arcee-ai/trinity-large-preview:free',
  // Tier 3 — Last resort
  'google/gemma-3-27b-it:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'minimax/minimax-m2.5:free',
  'stepfun/step-3.5-flash:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'openrouter/free',  // Auto-selects best available — absolute last resort
];

const TIMEOUT_MS = 25000;

// ── System prompt — demands full complete websites ──────────────
function buildSystemPrompt(siteType) {
  return `You are CLIX, an expert web developer. Generate a COMPLETE, FULL, PRODUCTION-READY single-page website.

SITE TYPE: ${siteType}

CRITICAL REQUIREMENTS:
- Output ONE complete HTML file with ALL CSS inside <style> tags in <head> and ALL JavaScript inside <script> tags before </body>
- The file must be immediately usable — open it and it works perfectly
- Include REAL content, not placeholder text like "Lorem ipsum"
- Include at least 5-7 distinct sections with real information
- Full mobile responsiveness with media queries
- Smooth animations and hover effects
- Professional typography using Google Fonts (load via @import in CSS)
- Beautiful, modern design — NOT generic or basic
- The website must look like it was made by a professional agency

RESPOND WITH ONLY this JSON — no markdown, no explanation, no code blocks:
{
  "html": "COMPLETE HTML FILE CONTENT HERE — must include <!DOCTYPE html>, <html>, <head> with styles, <body> with all content and scripts"
}

The HTML value must be the entire complete file as a string. Make it impressive.`;
}

// ── Call a single model with streaming ─────────────────────────
async function callModelStreaming(model, messages) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://clix.app',
        'X-Title': 'CLIX',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 8000,
        temperature: 0.7,
        stream: true,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;

  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ── Main handler ────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { userToken, prompt, siteType = 'landing' } = req.body;
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';

  // ── Auth check ──────────────────────────────────
  if (!userToken) {
    await supabase.from('abuse_logs').insert({ reason: 'no_token', ip_address: ip });
    return res.status(401).json({ message: 'Authentication required' });
  }

  const { data: { user }, error: authErr } = await supabase.auth.getUser(userToken);
  if (authErr || !user) {
    await supabase.from('abuse_logs').insert({ reason: 'invalid_token', ip_address: ip });
    return res.status(401).json({ message: 'Invalid session. Please log in again.' });
  }

  // ── Validate prompt ─────────────────────────────
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 5) {
    return res.status(400).json({ message: 'Please provide a more detailed description.' });
  }
  const cleanPrompt = prompt.trim().slice(0, 1000);

  // ── Check if user is banned ─────────────────────
  const { data: profile } = await supabase
    .from('profiles').select('is_banned,daily_count,quota_reset_at').eq('id', user.id).single();

  if (profile?.is_banned) {
    return res.status(403).json({ message: 'Account suspended. Contact support.' });
  }

  // ── Server-side quota check ─────────────────────
  const resetAt = new Date(profile?.quota_reset_at || 0);
  const now = new Date();
  const isNewDay = now.toDateString() !== resetAt.toDateString();
  const dayCount = isNewDay ? 0 : (profile?.daily_count || 0);
  if (dayCount >= 3) {
    return res.status(429).json({ message: 'Daily limit reached. Come back tomorrow!' });
  }

  // ── Global cap check ────────────────────────────
  const { data: globalData } = await supabase
    .from('global_stats').select('daily_count,last_reset').eq('id', 1).single();

  const globalReset = new Date(globalData?.last_reset || 0);
  const globalNewDay = now.toDateString() !== globalReset.toDateString();
  const globalCount = globalNewDay ? 0 : (globalData?.daily_count || 0);
  if (globalCount >= 3000) {
    return res.status(503).json({ message: 'CLIX is fully booked for today. We reset at midnight!' });
  }

  // ── Set up streaming response ───────────────────
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  const messages = [
    { role: 'system', content: buildSystemPrompt(siteType) },
    { role: 'user', content: `Build me: ${cleanPrompt}` },
  ];

  // ── Try each model ──────────────────────────────
  let lastError = null;

  for (const model of MODELS) {
    try {
      const streamRes = await callModelStreaming(model, messages);
      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              res.write(delta);
            }
          } catch {}
        }
      }

      // Log success
      await supabase.from('admin_logs').insert({
        action: 'generation_success',
        performed_by: user.email,
        target_user: user.id,
        details: JSON.stringify({ model, siteType, promptLength: cleanPrompt.length }),
      }).catch(() => {});

      res.end();
      return;

    } catch (err) {
      lastError = err;
      console.warn(`Model ${model} failed:`, err.message);
      continue;
    }
  }

  // ── All models failed ───────────────────────────
  await supabase.from('admin_logs').insert({
    action: 'generation_all_failed',
    performed_by: user.email,
    target_user: user.id,
    details: JSON.stringify({ lastError: lastError?.message, siteType }),
  }).catch(() => {});

  res.status(503).json({ message: 'All AI models are at capacity right now. Please try again in a few minutes.' });
}
