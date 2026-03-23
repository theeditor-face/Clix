// ═══════════════════════════════════════════════════════════════
//  CLIX — api/generate.js
//  Production backend — every security layer included
//  Rate limiting · Quota · Ad verification · Model fallback
//  Usage logging · Quota refund on failure · Real streaming
// ═══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';

// ── Supabase admin client (server-side only) ─────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── In-memory rate limiter ───────────────────────────────────────
// Resets on each Vercel cold start
// For production scale: replace with Upstash Redis
const rateLimitStore = new Map();

function checkRateLimit(key, maxRequests, windowMs) {
  const now    = Date.now();
  const record = rateLimitStore.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) { record.count = 0; record.resetAt = now + windowMs; }
  record.count++;
  rateLimitStore.set(key, record);
  return { allowed: record.count <= maxRequests };
}

// ── Model stack — verified free on OpenRouter March 2026 ─────────
// Backend only — never exposed to frontend
const MODELS = [
  'qwen/qwen3-coder:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
  'openai/gpt-oss-120b:free',
  'openai/gpt-oss-20b:free',
  'z-ai/glm-4.5-air:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'arcee-ai/trinity-large-preview:free',
  'google/gemma-3-27b-it:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'minimax/minimax-m2.5:free',
  'stepfun/step-3.5-flash:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'openrouter/free',
];

const MODEL_TIMEOUT_MS = 25000;
const DAILY_QUOTA      = 3;
const GLOBAL_CAP       = 3000;

// ── System prompt ────────────────────────────────────────────────
function buildSystemPrompt(siteType) {
  return `You are CLIX, an expert web developer. Generate a COMPLETE, FULL, PRODUCTION-READY website.

SITE TYPE: ${siteType}

REQUIREMENTS:
- ONE complete HTML file. ALL CSS inside <style> in <head>. ALL JS inside <script> before </body>
- Works immediately when opened — no external dependencies except Google Fonts via @import
- Real content — NO "Lorem ipsum". Real section names. Real copy text
- At least 6 distinct sections with real content
- Full mobile responsiveness with media queries
- Smooth CSS animations and hover effects
- Google Fonts loaded via @import in the CSS
- Professional, modern, visually impressive design
- Add a subtle "Built with CLIX" in the footer

RESPOND WITH ONLY valid JSON — no markdown, no explanation, nothing else:
{"html":"COMPLETE HTML FILE AS A STRING"}`;
}

// ── Log to admin_logs table ──────────────────────────────────────
async function adminLog(action, userId, email, details) {
  try {
    await supabase.from('admin_logs').insert({
      action,
      performed_by: email || 'unknown',
      target_user:  userId || 'unknown',
      details:      JSON.stringify(details || {}),
    });
  } catch {}
}

// ── Refund quota after AI failure ────────────────────────────────
async function refundQuota(userId) {
  try {
    const { data } = await supabase
      .from('profiles').select('daily_count').eq('id', userId).single();
    if (data?.daily_count > 0) {
      await supabase.from('profiles')
        .update({ daily_count: data.daily_count - 1 })
        .eq('id', userId);
    }
  } catch {}
}

// ── Call one model with streaming ────────────────────────────────
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
        'X-Title':       'CLIX',
      },
      body: JSON.stringify({ model, messages, max_tokens: 8000, temperature: 0.7, stream: true }),
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

// ════════════════════════════════════════════════════════════════
//  MAIN HANDLER
// ════════════════════════════════════════════════════════════════
export default async function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const { userToken, prompt, siteType = 'landing', adWatched = false } = req.body;

  // ── STEP 1: Auth — verify JWT server-side ─────────────────────
  // getUser() hits Supabase servers — cannot be faked or shared
  if (!userToken) {
    await supabase.from('abuse_logs').insert({ reason: 'no_token', ip_address: ip });
    return res.status(401).json({ message: 'Authentication required. Please log in.' });
  }

  const { data: { user }, error: authErr } = await supabase.auth.getUser(userToken);
  if (authErr || !user) {
    await supabase.from('abuse_logs').insert({ reason: 'invalid_token', ip_address: ip });
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }

  // ── STEP 2: Check if banned ────────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_banned, ban_reason, daily_count, quota_reset_at')
    .eq('id', user.id).single();

  if (profile?.is_banned) {
    return res.status(403).json({ message: 'Account suspended. Contact support.' });
  }

  // ── STEP 3: Rate limit by IP ───────────────────────────────────
  if (!checkRateLimit(`ip:${ip}`, 10, 60000).allowed) {
    await supabase.from('abuse_logs').insert({ reason: 'ip_rate_limited', ip_address: ip, email: user.email });
    return res.status(429).json({ message: 'Too many requests. Please wait a moment.' });
  }

  // ── STEP 4: Rate limit by user ─────────────────────────────────
  if (!checkRateLimit(`user:${user.id}`, 5, 60000).allowed) {
    return res.status(429).json({ message: 'Generating too fast. Please wait a moment.' });
  }

  // ── STEP 5: Ad verification ────────────────────────────────────
  // adWatched flag sent from frontend after ad completes
  // For stronger enforcement: use a signed token from a separate endpoint
  if (!adWatched) {
    return res.status(403).json({ message: 'Please watch the ad to unlock generation.' });
  }

  // ── STEP 6: Validate prompt ────────────────────────────────────
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 5) {
    return res.status(400).json({ message: 'Please describe what you want to build.' });
  }
  const cleanPrompt = prompt.trim().slice(0, 1000);

  // ── STEP 7: Check quota server-side ───────────────────────────
  const resetAt  = new Date(profile?.quota_reset_at || 0);
  const now      = new Date();
  const isNewDay = now.toDateString() !== resetAt.toDateString();
  const dayCount = isNewDay ? 0 : (profile?.daily_count || 0);

  if (dayCount >= DAILY_QUOTA) {
    return res.status(429).json({ message: `Daily limit of ${DAILY_QUOTA} builds reached. Come back tomorrow!` });
  }

  // ── STEP 8: Check global cap ───────────────────────────────────
  const { data: globalStats } = await supabase
    .from('global_stats').select('daily_count, last_reset').eq('id', 1).single();
  const globalReset  = new Date(globalStats?.last_reset || 0);
  const globalNewDay = now.toDateString() !== globalReset.toDateString();
  const globalCount  = globalNewDay ? 0 : (globalStats?.daily_count || 0);

  if (globalCount >= GLOBAL_CAP) {
    return res.status(503).json({ message: 'CLIX has reached its daily limit. We reset at midnight!' });
  }

  // ── STEP 9: Increment quota BEFORE AI call ─────────────────────
  // Prevents abuse via repeated failed requests
  // Refunded below if ALL models fail
  const newDayCount = isNewDay ? 1 : dayCount + 1;
  await supabase.from('profiles').update({
    daily_count:    newDayCount,
    quota_reset_at: isNewDay ? now.toISOString() : profile.quota_reset_at,
    last_seen:      now.toISOString(),
  }).eq('id', user.id);

  // ── STEP 10: Increment global counter ─────────────────────────
  const newGlobalCount = globalNewDay ? 1 : globalCount + 1;
  await supabase.from('global_stats').update({
    daily_count: newGlobalCount,
    last_reset:  globalNewDay ? now.toISOString() : globalStats.last_reset,
  }).eq('id', 1);

  // ── STEP 11: Set up streaming response ────────────────────────
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  const messages = [
    { role: 'system', content: buildSystemPrompt(siteType) },
    { role: 'user',   content: `Build me: ${cleanPrompt}` },
  ];

  // ── STEP 12: Try each model — fallback on failure ─────────────
  let succeeded = false;
  let lastError = null;
  let modelUsed = null;

  for (const model of MODELS) {
    try {
      const streamRes = await callModel(model, messages);
      const reader    = streamRes.body.getReader();
      const decoder   = new TextDecoder();
      let   buffer    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const chunk = line.slice(6).trim();
          if (chunk === '[DONE]') continue;
          try {
            const delta = JSON.parse(chunk)?.choices?.[0]?.delta?.content;
            if (delta) res.write(delta);
          } catch {}
        }
      }

      modelUsed = model;
      succeeded = true;

      await adminLog('generation_success', user.id, user.email, {
        model,
        siteType,
        promptLength: cleanPrompt.length,
        quotaUsed:    newDayCount,
        globalCount:  newGlobalCount,
        ip,
      });

      res.end();
      return;

    } catch (err) {
      lastError = err;
      console.warn(`[CLIX] Model ${model} failed: ${err.message}`);
      continue;
    }
  }

  // ── STEP 13: All models failed — refund quota ─────────────────
  await refundQuota(user.id);
  try {
    await supabase.from('global_stats')
      .update({ daily_count: Math.max(0, newGlobalCount - 1) })
      .eq('id', 1);
  } catch {}

  await adminLog('generation_all_failed', user.id, user.email, {
    lastError: lastError?.message,
    siteType,
    ip,
  });

  return res.status(503).json({
    message: 'All AI models are at capacity. Your quota was not used. Try again in a few minutes.'
  });
}
