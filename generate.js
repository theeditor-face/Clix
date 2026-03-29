// ═══════════════════════════════════════════════════════════════
//  CLIX — api/generate.js
//  No login required — rate limited by IP + global daily cap
// ═══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── In-memory rate limiter by IP ─────────────────────────────
const rateStore = new Map();
function rateLimit(key, max, windowMs) {
  const now    = Date.now();
  const record = rateStore.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) { record.count = 0; record.resetAt = now + windowMs; }
  record.count++;
  rateStore.set(key, record);
  return record.count <= max;
}

// ── AI Models — free tier on OpenRouter ──────────────────────
const MODELS = [
  'qwen/qwen3-coder:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
  'openai/gpt-oss-120b:free',
  'openai/gpt-oss-20b:free',
  'z-ai/glm-4.5-air:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'google/gemma-3-27b-it:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'openrouter/free',
];

const GLOBAL_CAP  = 3000;
const TIMEOUT_MS  = 25000;

function buildPrompt(siteType) {
  return `You are CLIX, an expert web developer. Generate a COMPLETE, PRODUCTION-READY website.

SITE TYPE: ${siteType}

RULES:
- Output ONE complete HTML file
- ALL CSS inside <style> tags in <head>
- ALL JavaScript inside <script> tags before </body>
- Use Google Fonts via @import in CSS
- Real content — NO Lorem ipsum — minimum 6 sections
- Mobile responsive with media queries
- Smooth animations and hover effects
- Professional, impressive design
- Add "Built with CLIX ✦" subtly in the footer

RESPOND WITH ONLY this JSON — nothing else:
{"html":"COMPLETE HTML FILE HERE"}`;
}

async function callModel(model, messages) {
  const ctrl    = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type':  'application/json',
        'HTTP-Referer':  process.env.NEXT_PUBLIC_APP_URL || 'https://clix.app',
        'X-Title':       'CLIX',
      },
      body: JSON.stringify({ model, messages, max_tokens: 8000, temperature: 0.7, stream: true }),
      signal: ctrl.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } catch(e) { clearTimeout(timeout); throw e; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const ip = (req.headers['x-forwarded-for']||'').split(',')[0].trim() || 'unknown';
  const { prompt, siteType = 'landing', adWatched = false } = req.body;

  // ── Rate limit by IP — 10 requests per minute ────────────
  if (!rateLimit(`ip:${ip}`, 10, 60000)) {
    return res.status(429).json({ message: 'Too many requests. Please wait a moment.' });
  }

  // ── Ad watched check ──────────────────────────────────────
  if (!adWatched) {
    return res.status(403).json({ message: 'Please watch the ad to unlock generation.' });
  }

  // ── Validate prompt ───────────────────────────────────────
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 5) {
    return res.status(400).json({ message: 'Please describe what you want to build.' });
  }
  const cleanPrompt = prompt.trim().slice(0, 1000);

  // ── Global cap check ──────────────────────────────────────
  try {
    const { data: g } = await supabase.from('global_stats').select('daily_count,last_reset').eq('id',1).single();
    if (g) {
      const isNew  = new Date().toDateString() !== new Date(g.last_reset).toDateString();
      const count  = isNew ? 0 : (g.daily_count || 0);
      if (count >= GLOBAL_CAP) {
        return res.status(503).json({ message: 'CLIX has reached its daily limit of 3,000 builds. We reset at midnight!' });
      }
      // Increment
      await supabase.from('global_stats').update({
        daily_count: isNew ? 1 : count + 1,
        last_reset:  isNew ? new Date().toISOString() : g.last_reset,
      }).eq('id', 1);
    }
  } catch(e) { /* Don't block generation if counter fails */ }

  // ── Stream response ───────────────────────────────────────
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  const messages = [
    { role: 'system', content: buildPrompt(siteType) },
    { role: 'user',   content: `Build: ${cleanPrompt}` },
  ];

  // ── Try each model, fallback on failure ───────────────────
  for (const model of MODELS) {
    try {
      const stream  = await callModel(model, messages);
      const reader  = stream.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';

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

      res.end();
      return;

    } catch(err) {
      console.warn(`[CLIX] ${model} failed: ${err.message}`);
      continue;
    }
  }

  // All models failed
  res.status(503).json({ message: 'All AI models are at capacity. Try again in a few minutes.' });
}
