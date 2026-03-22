// ═══════════════════════════════════════════════════════════════
//  CLIX — script.js
//  Real Supabase credentials · Fixed auth flow · All features
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// ─── SUPABASE ─────────────────────────────────────────────────
const supabase = createClient(
  'https://kikimirbzsnlcydzjdco.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtpa2ltaXJienNubGN5ZHpqZGNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMDcxOTgsImV4cCI6MjA4OTc4MzE5OH0.Q8Qm2_v2-1OycwjLJRBNBgAFNSlP7i3ZJtiq1qrfdtI'
);

// ─── CONSTANTS ────────────────────────────────────────────────
const DAILY_QUOTA  = 3;
const GLOBAL_CAP   = 3000;
const OTP_SECS     = 300;

// ─── STATE ────────────────────────────────────────────────────
let currentUser      = null;
let userQuota        = DAILY_QUOTA;
let adWatched        = false;
let selectedType     = 'landing';
let generatedCode    = { html: '', css: '', js: '' };
let otpInterval      = null;
let otpSecsLeft      = OTP_SECS;
let currentEmail     = '';
let activeFile       = 'html';

// ─── DOM ──────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ─── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initCursor();
  initBgCanvas();
  loadGlobalCounter();
  checkSession();
  setInterval(loadGlobalCounter, 60000);
});

// ═══════════════════════════════════════════════════════════════
//  THEME
// ═══════════════════════════════════════════════════════════════
function initTheme() {
  const saved = localStorage.getItem('clix-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
}

$('themeToggle').addEventListener('click', () => {
  const cur  = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('clix-theme', next);
});

// ═══════════════════════════════════════════════════════════════
//  ANIMATED BACKGROUND CANVAS
// ═══════════════════════════════════════════════════════════════
function initBgCanvas() {
  const canvas = $('bgCanvas');
  if (!canvas) return;
  const ctx    = canvas.getContext('2d');
  let w, h, particles = [];

  function resize() {
    w = canvas.width  = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // Create particles
  for (let i = 0; i < 60; i++) {
    particles.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      size: Math.random() * 1.5 + 0.3,
      opacity: Math.random() * 0.5 + 0.1
    });
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);

    // Draw grid
    ctx.strokeStyle = 'rgba(0,245,255,0.03)';
    ctx.lineWidth   = 1;
    const gridSize  = 80;
    for (let x = 0; x < w; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Draw particles
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,245,255,${p.opacity})`;
      ctx.fill();
    });

    // Connect nearby particles
    particles.forEach((p, i) => {
      particles.slice(i + 1).forEach(q => {
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < 120) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = `rgba(0,245,255,${0.06 * (1 - d / 120)})`;
          ctx.lineWidth   = 0.5;
          ctx.stroke();
        }
      });
    });

    requestAnimationFrame(draw);
  }
  draw();
}

// ═══════════════════════════════════════════════════════════════
//  CURSOR
// ═══════════════════════════════════════════════════════════════
function initCursor() {
  const dot   = $('cursor');
  const trail = $('cursorTrail');
  if (!dot || !trail) return;

  let mx = 0, my = 0, tx = 0, ty = 0;

  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    dot.style.left = mx + 'px';
    dot.style.top  = my + 'px';
  });

  (function animTrail() {
    tx += (mx - tx) * 0.1;
    ty += (my - ty) * 0.1;
    trail.style.left = tx + 'px';
    trail.style.top  = ty + 'px';
    requestAnimationFrame(animTrail);
  })();
}

// ═══════════════════════════════════════════════════════════════
//  GLOBAL COUNTER
// ═══════════════════════════════════════════════════════════════
async function loadGlobalCounter() {
  try {
    const { data } = await supabase
      .from('global_stats')
      .select('daily_count, last_reset')
      .eq('id', 1)
      .single();

    if (!data) return;

    // Reset if new day
    const lastReset = new Date(data.last_reset);
    const now       = new Date();
    if (now.toDateString() !== lastReset.toDateString()) {
      await supabase.from('global_stats')
        .update({ daily_count: 0, last_reset: now.toISOString() })
        .eq('id', 1);
      updateCounter(0);
      return;
    }

    updateCounter(data.daily_count);

    // Update hero live counter
    const liveEl = $('liveCounter');
    if (liveEl) liveEl.textContent = data.daily_count.toLocaleString();

    if (data.daily_count >= GLOBAL_CAP) showCapOverlay();

  } catch (e) { console.warn('Counter load failed:', e); }
}

function updateCounter(count) {
  const pct   = Math.min((count / GLOBAL_CAP) * 100, 100);
  const fill  = $('counterFill');
  const label = $('counterLabel');
  if (fill)  fill.style.width    = pct + '%';
  if (label) label.textContent   = `${count.toLocaleString()} / ${GLOBAL_CAP.toLocaleString()}`;
}

async function incrementGlobal() {
  const { data } = await supabase
    .from('global_stats').select('daily_count').eq('id', 1).single();
  const newCount = (data?.daily_count || 0) + 1;
  await supabase.from('global_stats')
    .update({ daily_count: newCount }).eq('id', 1);
  updateCounter(newCount);
  if (newCount >= GLOBAL_CAP) showCapOverlay();
}

// ─── Cap overlay ──────────────────────────────────────────────
function showCapOverlay() {
  $('capOverlay').style.display = 'flex';
  startCapTimer();
}

function startCapTimer() {
  function tick() {
    const now  = new Date();
    const mid  = new Date(); mid.setHours(24, 0, 0, 0);
    const diff = Math.max(0, mid - now);
    $('capHH').textContent = String(Math.floor(diff / 3600000)).padStart(2, '0');
    $('capMM').textContent = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
    $('capSS').textContent = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
  }
  tick();
  setInterval(tick, 1000);
}

$('capNotifyBtn').addEventListener('click', async () => {
  const email = $('capEmailInput').value.trim();
  if (!email || !/\S+@\S+\.\S+/.test(email)) { showToast('Enter a valid email', 'error'); return; }
  await supabase.from('abuse_logs').insert({ email, reason: 'cap_notify', ip_address: 'unknown' });
  $('capNotifyBtn').textContent = '✓ You\'re on the list!';
  $('capNotifyBtn').disabled = true;
  showToast('We\'ll notify you at reset!', 'success');
});

// ═══════════════════════════════════════════════════════════════
//  SESSION CHECK
// ═══════════════════════════════════════════════════════════════
async function checkSession() {
  // Listen for auth changes
  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      currentUser = session.user;
      await onLoggedIn();
    } else {
      currentUser = null;
      showScreen('hero');
    }
  });

  // Check existing session
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    await onLoggedIn();
  } else {
    showScreen('hero');
  }
}

async function onLoggedIn() {
  await loadGlobalCounter();
  await loadUserQuota();
  await loadHistory();
  updateSidebarUser();
  showScreen('builder');
  $('quotaPill').style.display = 'inline-flex';
  $('logoutBtn').style.display = 'inline-flex';
}

// ═══════════════════════════════════════════════════════════════
//  SCREEN MANAGEMENT
// ═══════════════════════════════════════════════════════════════
function showScreen(name) {
  $('screenHero').style.display          = 'none';
  $('screenCreateAccount').style.display = 'none';
  $('screenVerifyOtp').style.display     = 'none';
  $('screenBuilder').style.display       = 'none';

  if (name === 'hero')          $('screenHero').style.display          = '';
  if (name === 'createAccount') $('screenCreateAccount').style.display = '';
  if (name === 'verifyOtp')     $('screenVerifyOtp').style.display     = '';
  if (name === 'builder')       $('screenBuilder').style.display       = '';
}

// ═══════════════════════════════════════════════════════════════
//  HERO BUTTON — goes to Create Account page
// ═══════════════════════════════════════════════════════════════
$('heroGetStarted').addEventListener('click', () => {
  if (currentUser) {
    showScreen('builder');
  } else {
    showScreen('createAccount');
  }
});

// ═══════════════════════════════════════════════════════════════
//  ANON OVERLAY
// ═══════════════════════════════════════════════════════════════
function showAnonOverlay() {
  $('anonOverlay').style.display = 'flex';
}

$('anonSignupBtn').addEventListener('click', () => {
  $('anonOverlay').style.display = 'none';
  showScreen('createAccount');
});

$('anonDismissBtn').addEventListener('click', () => {
  $('anonOverlay').style.display = 'none';
  showScreen('createAccount');
});

// ═══════════════════════════════════════════════════════════════
//  AUTH — STEP 1: EMAIL → SEND OTP
// ═══════════════════════════════════════════════════════════════
$('sendOtpBtn').addEventListener('click', async () => {
  const email = $('emailInput').value.trim().toLowerCase();
  const terms = $('termsChk').checked;

  hideErr('emailErr');

  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    showErr('emailErr', 'Enter a valid email address.');
    return;
  }
  if (!terms) {
    showErr('emailErr', 'Please accept the Terms of Use to continue.');
    return;
  }

  const btn = $('sendOtpBtn');
  btn.disabled    = true;
  btn.textContent = 'SENDING...';

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true }
    });

    if (error) throw error;

    currentEmail = email;
    $('otpEmailShow').textContent = email;
    showScreen('verifyOtp');
    startOtpTimer();
    // Focus first cell
    setTimeout(() => document.querySelector('.otp-cell')?.focus(), 100);

  } catch (err) {
    showErr('emailErr', err.message || 'Failed to send code. Try again.');
  } finally {
    btn.disabled    = false;
    btn.innerHTML   = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> SEND VERIFICATION CODE';
  }
});

// Switch to login (same flow — just go to create account page)
$('switchToLoginBtn').addEventListener('click', () => {
  showScreen('createAccount');
});

// ═══════════════════════════════════════════════════════════════
//  AUTH — STEP 2: OTP VERIFY
// ═══════════════════════════════════════════════════════════════
// OTP cell behaviour
document.addEventListener('input', e => {
  if (!e.target.classList.contains('otp-cell')) return;
  const cell  = e.target;
  const idx   = parseInt(cell.dataset.idx);
  const cells = document.querySelectorAll('.otp-cell');
  const val   = cell.value.replace(/\D/g, '');

  cell.value = val.slice(-1);
  cell.classList.toggle('filled', !!cell.value);

  if (val && idx < 5) cells[idx + 1]?.focus();

  // Auto verify when all filled
  if ([...cells].every(c => c.value)) $('verifyOtpBtn').click();
});

document.addEventListener('keydown', e => {
  if (!e.target.classList.contains('otp-cell')) return;
  const cell  = e.target;
  const idx   = parseInt(cell.dataset.idx);
  const cells = document.querySelectorAll('.otp-cell');
  if (e.key === 'Backspace' && !cell.value && idx > 0) {
    cells[idx - 1].focus();
    cells[idx - 1].value = '';
    cells[idx - 1].classList.remove('filled');
  }
});

$('verifyOtpBtn').addEventListener('click', async () => {
  const cells = document.querySelectorAll('.otp-cell');
  const token = [...cells].map(c => c.value).join('');

  hideErr('otpErr');

  if (token.length !== 6) {
    showErr('otpErr', 'Enter all 6 digits.');
    return;
  }

  const btn        = $('verifyOtpBtn');
  btn.disabled     = true;
  btn.textContent  = 'VERIFYING...';

  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email: currentEmail,
      token,
      type: 'email'
    });

    if (error) throw error;

    clearInterval(otpInterval);
    await ensureProfile(data.user);
    currentUser = data.user;
    await onLoggedIn();
    showToast('Welcome to CLIX! 🚀', 'success');

  } catch (err) {
    showErr('otpErr', 'Invalid or expired code. Try again.');
    document.querySelectorAll('.otp-cell').forEach(c => {
      c.classList.add('shake');
      setTimeout(() => c.classList.remove('shake'), 500);
    });
  } finally {
    btn.disabled    = false;
    btn.innerHTML   = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> VERIFY & ENTER CLIX';
  }
});

$('resendBtn').addEventListener('click', async () => {
  $('resendBtn').disabled    = true;
  $('resendBtn').textContent = 'Sending...';
  try {
    await supabase.auth.signInWithOtp({ email: currentEmail });
    clearInterval(otpInterval);
    otpSecsLeft = OTP_SECS;
    startOtpTimer();
    document.querySelectorAll('.otp-cell').forEach(c => { c.value = ''; c.classList.remove('filled'); });
    document.querySelector('.otp-cell')?.focus();
    showToast('New code sent!', 'success');
  } catch { showToast('Failed to resend. Try again.', 'error'); }
  finally {
    $('resendBtn').disabled    = false;
    $('resendBtn').textContent = 'Resend code';
  }
});

$('authBackBtn').addEventListener('click', () => {
  clearInterval(otpInterval);
  showScreen('createAccount');
  document.querySelectorAll('.otp-cell').forEach(c => { c.value = ''; c.classList.remove('filled'); });
  hideErr('otpErr');
});

function startOtpTimer() {
  otpSecsLeft = OTP_SECS;
  clearInterval(otpInterval);
  otpInterval = setInterval(() => {
    otpSecsLeft--;
    const m = Math.floor(otpSecsLeft / 60);
    const s = String(otpSecsLeft % 60).padStart(2, '0');
    const el = $('otpCountdown');
    if (el) el.textContent = `${m}:${s}`;
    if (otpSecsLeft <= 0) {
      clearInterval(otpInterval);
      if (el) el.textContent = 'Expired';
      showErr('otpErr', 'Code expired. Click "Resend code".');
    }
  }, 1000);
}

async function ensureProfile(user) {
  try {
    const { data } = await supabase.from('profiles').select('id').eq('id', user.id).single();
    if (!data) {
      await supabase.from('profiles').insert({
        id: user.id, email: user.email, last_seen: new Date().toISOString()
      });
    } else {
      await supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', user.id);
    }
  } catch (e) { console.warn('Profile error:', e); }
}

// ─── Auth helpers ─────────────────────────────────────────────
function showErr(id, msg) {
  const el = $(id); if (!el) return;
  el.textContent   = '⚠ ' + msg;
  el.style.display = '';
}
function hideErr(id) {
  const el = $(id); if (!el) return;
  el.style.display = 'none';
  el.textContent   = '';
}

// ═══════════════════════════════════════════════════════════════
//  LOGOUT
// ═══════════════════════════════════════════════════════════════
$('logoutBtn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  currentUser = null;
  adWatched   = false;
  $('quotaPill').style.display = 'none';
  $('logoutBtn').style.display = 'none';
  showScreen('hero');
  showToast('Logged out', 'info');
});

// ═══════════════════════════════════════════════════════════════
//  QUOTA
// ═══════════════════════════════════════════════════════════════
async function loadUserQuota() {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('daily_count, quota_reset_at')
      .eq('id', currentUser.id)
      .single();

    if (!data) return;

    const resetAt  = new Date(data.quota_reset_at);
    const now      = new Date();
    const isNewDay = now.toDateString() !== resetAt.toDateString();

    if (isNewDay) {
      await supabase.from('profiles')
        .update({ daily_count: 0, quota_reset_at: now.toISOString() })
        .eq('id', currentUser.id);
      userQuota = DAILY_QUOTA;
    } else {
      userQuota = Math.max(0, DAILY_QUOTA - (data.daily_count || 0));
    }
    updateQuotaUI();
  } catch (e) { console.warn('Quota load error:', e); }
}

async function incrementQuota() {
  const { data } = await supabase
    .from('profiles').select('daily_count').eq('id', currentUser.id).single();
  const newCount = (data?.daily_count || 0) + 1;
  await supabase.from('profiles').update({ daily_count: newCount }).eq('id', currentUser.id);
  userQuota = Math.max(0, DAILY_QUOTA - newCount);
  updateQuotaUI();
}

function updateQuotaUI() {
  $('quotaNum').textContent = userQuota;
  $('sbQuota').textContent  = `${userQuota} build${userQuota !== 1 ? 's' : ''} left today`;
  if (userQuota === 0) {
    $('generateBtn').disabled    = true;
    $('genBtnText').textContent  = 'DAILY LIMIT REACHED';
  }
}

// ═══════════════════════════════════════════════════════════════
//  SIDEBAR USER
// ═══════════════════════════════════════════════════════════════
function updateSidebarUser() {
  if (!currentUser) return;
  $('sbEmail').textContent  = currentUser.email || '';
  $('sbAvatar').textContent = (currentUser.email || '?').charAt(0).toUpperCase();
}

// Sidebar toggle (mobile)
$('sidebarToggle').addEventListener('click', () => {
  const open = $('sidebar').classList.toggle('open');
  $('sidebarToggle').classList.toggle('open', open);
});

document.addEventListener('click', e => {
  if (window.innerWidth > 768) return;
  const sb  = $('sidebar');
  const tog = $('sidebarToggle');
  if (sb.classList.contains('open') && !sb.contains(e.target) && !tog.contains(e.target)) {
    sb.classList.remove('open');
    tog.classList.remove('open');
  }
});

// ═══════════════════════════════════════════════════════════════
//  SITE TYPE
// ═══════════════════════════════════════════════════════════════
$('typeGrid').addEventListener('click', e => {
  const btn = e.target.closest('.type-btn');
  if (!btn) return;
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedType = btn.dataset.type;
});

// ═══════════════════════════════════════════════════════════════
//  PROMPT
// ═══════════════════════════════════════════════════════════════
$('promptInput').addEventListener('input', () => {
  $('charCount').textContent = `${$('promptInput').value.length} / 1000`;
});

$('clearBtn').addEventListener('click', () => {
  $('promptInput').value    = '';
  $('charCount').textContent = '0 / 1000';
  $('promptInput').focus();
});

// ═══════════════════════════════════════════════════════════════
//  AD GATE
// ═══════════════════════════════════════════════════════════════
function initAdGate() {
  $('rewardedWrap').style.display = '';
}

window.onAdComplete = function () {
  adWatched = true;
  $('gateNotice').style.display   = 'none';
  $('rewardedWrap').style.display = 'none';
  if (userQuota > 0) {
    $('generateBtn').disabled      = false;
    $('genBtnText').textContent    = 'GENERATE WEBSITE';
  }
  showToast('Ad complete — ready to generate!', 'success');
};

const devBtn = $('devAdBtn');
if (devBtn) devBtn.addEventListener('click', () => window.onAdComplete());

// Show ad gate when builder is visible
const builderObserver = new MutationObserver(() => {
  if ($('screenBuilder').style.display !== 'none') initAdGate();
});
builderObserver.observe($('screenBuilder'), { attributes: true, attributeFilter: ['style'] });

// ═══════════════════════════════════════════════════════════════
//  GENERATION
// ═══════════════════════════════════════════════════════════════
$('generateBtn').addEventListener('click', async () => {
  if (!currentUser) { showAnonOverlay(); return; }

  const prompt = $('promptInput').value.trim();
  if (!prompt) { showToast('Describe your site first!', 'warn'); return; }
  if (!adWatched) { showToast('Watch the short ad first to unlock.', 'warn'); return; }
  if (userQuota <= 0) { showToast('Daily limit reached. Come back tomorrow!', 'warn'); return; }

  await runGeneration(prompt);
});

async function runGeneration(prompt) {
  $('outputCard').style.display   = 'none';
  $('errorCard').style.display    = 'none';
  $('skeletonCard').style.display = '';
  $('progressCard').style.display = '';
  $('generateBtn').disabled       = true;
  $('genBtnText').textContent     = 'BUILDING...';

  adWatched = false;

  setStep(1); setProgress(5);

  try {
    await delay(500);
    setStep(2); setProgress(22);

    const session = (await supabase.auth.getSession()).data.session;

    const res = await fetch('/api/generate', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        prompt,
        siteType:  selectedType,
        userToken: session?.access_token
      })
    });

    setStep(3); setProgress(55);
    await delay(300);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Generation failed');
    }

    const data = await res.json();

    setStep(4); setProgress(80);
    await delay(300);

    if (data.modelUsed) {
      const short = data.modelUsed.split('/').pop()?.replace(':free', '') || 'AI';
      $('modelName').textContent     = short.toUpperCase();
      $('progressModel').textContent = `USING: ${short.toUpperCase()}`;
    }

    setStep(5); setProgress(100);
    await delay(400);

    generatedCode = { html: data.html || '', css: data.css || '', js: data.js || '' };

    await incrementQuota();
    await incrementGlobal();
    await saveGeneration(prompt, data);

    $('progressCard').style.display  = 'none';
    $('skeletonCard').style.display  = 'none';
    $('outputCard').style.display    = '';
    showTab('preview');
    renderPreview();

    // Reset gate for next generation
    $('gateNotice').style.display   = '';
    $('rewardedWrap').style.display = '';
    $('generateBtn').disabled       = true;
    $('genBtnText').textContent     = 'GENERATE WEBSITE';

    showToast('Your site is ready! 🎉', 'success');

  } catch (err) {
    $('progressCard').style.display  = 'none';
    $('skeletonCard').style.display  = 'none';
    $('errorCard').style.display     = '';
    $('errorMsg').textContent        = err.message || 'Something went wrong. Try again.';
    $('generateBtn').disabled        = false;
    $('genBtnText').textContent      = 'GENERATE WEBSITE';
  }
}

function setStep(n) {
  for (let i = 1; i <= 5; i++) {
    const el = $(`ps${i}`); if (!el) continue;
    el.classList.remove('active', 'done');
    if (i < n)  el.classList.add('done');
    if (i === n) el.classList.add('active');
  }
}

function setProgress(pct) { $('progressFill').style.width = pct + '%'; }

// ═══════════════════════════════════════════════════════════════
//  OUTPUT TABS
// ═══════════════════════════════════════════════════════════════
$('tabPreviewBtn').addEventListener('click', () => showTab('preview'));
$('tabCodeBtn').addEventListener('click',   () => showTab('code'));

function showTab(name) {
  $('tabPreview').style.display = name === 'preview' ? '' : 'none';
  $('tabCode').style.display    = name === 'code'    ? '' : 'none';
  $('tabPreviewBtn').classList.toggle('active', name === 'preview');
  $('tabCodeBtn').classList.toggle('active',    name === 'code');
  if (name === 'code') renderCode(activeFile);
}

function renderPreview() {
  $('previewFrame').srcdoc = buildFullHTML();
}

function buildFullHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<style>${generatedCode.css}</style>
</head>
<body>
${generatedCode.html}
<script>${generatedCode.js}<\/script>
<!-- Built with CLIX ✦ -->
</body>
</html>`;
}

document.querySelectorAll('.cf-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cf-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFile = btn.dataset.file;
    renderCode(activeFile);
  });
});

function renderCode(file) {
  $('codeContent').textContent = ({ html: generatedCode.html, css: generatedCode.css, js: generatedCode.js })[file] || '';
}

// ═══════════════════════════════════════════════════════════════
//  COPY
// ═══════════════════════════════════════════════════════════════
$('copyBtn').addEventListener('click', async () => {
  const text = $('tabCode').style.display !== 'none'
    ? ({ html: generatedCode.html, css: generatedCode.css, js: generatedCode.js })[activeFile]
    : buildFullHTML();

  try {
    await navigator.clipboard.writeText(text);
    $('copyBtn').textContent = '✓ Copied!';
    setTimeout(() => { $('copyBtn').textContent = '⎘ Copy'; }, 2000);
    showToast('Copied!', 'success');
  } catch { showToast('Copy failed', 'error'); }
});

// ═══════════════════════════════════════════════════════════════
//  DOWNLOAD ZIP
// ═══════════════════════════════════════════════════════════════
$('downloadBtn').addEventListener('click', async () => {
  if (!generatedCode.html) { showToast('Nothing to download yet', 'warn'); return; }

  try {
    const zip = new JSZip();
    zip.file('index.html', buildFullHTML());
    zip.file('style.css',  generatedCode.css  || '');
    zip.file('script.js',  generatedCode.js   || '');
    zip.file('README.md',  '# Built with CLIX ✦\n\nhttps://clix.app\n');

    const blob = await zip.generateAsync({ type: 'blob' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'clix-site.zip'; a.click();
    URL.revokeObjectURL(url);
    showToast('ZIP downloaded!', 'success');
  } catch { showToast('Download failed', 'error'); }
});

// ═══════════════════════════════════════════════════════════════
//  SHARE
// ═══════════════════════════════════════════════════════════════
$('shareBtn').addEventListener('click', () => {
  const text = encodeURIComponent('I just built a website in seconds with CLIX — free AI website builder! 🚀 https://clix.app');
  $('shareX').href  = `https://twitter.com/intent/tweet?text=${text}`;
  $('shareWa').href = `https://wa.me/?text=${text}`;
  $('shareTg').href = `https://t.me/share/url?url=https://clix.app&text=${encodeURIComponent('Built with CLIX 🚀')}`;
  $('shareModal').style.display = '';
});

$('shareClose').addEventListener('click', () => { $('shareModal').style.display = 'none'; });

// ═══════════════════════════════════════════════════════════════
//  HISTORY
// ═══════════════════════════════════════════════════════════════
async function saveGeneration(prompt, data) {
  if (!currentUser) return;
  try {
    await supabase.from('generations').insert({
      user_id:     currentUser.id,
      prompt,
      title:       prompt.slice(0, 45) + (prompt.length > 45 ? '...' : ''),
      site_type:   selectedType,
      model_used:  data.modelUsed || 'unknown',
      html_output: data.html || '',
      css_output:  data.css  || '',
      js_output:   data.js   || ''
    });
    await loadHistory();
  } catch (e) { console.warn('Save history error:', e); }
}

async function loadHistory() {
  if (!currentUser) return;
  try {
    const { data } = await supabase
      .from('generations')
      .select('id, title, site_type, created_at, html_output, css_output, js_output')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(20);

    renderHistory(data || []);
  } catch (e) { console.warn('Load history error:', e); }
}

function renderHistory(items) {
  const list  = $('historyList');
  const empty = $('histEmpty');
  if (!items.length) { empty.style.display = ''; return; }

  empty.style.display = 'none';
  list.querySelectorAll('.hist-item').forEach(el => el.remove());

  items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'hist-item';
    el.innerHTML = `
      <div class="hist-prompt">${esc(item.title || item.prompt || 'Untitled')}</div>
      <div class="hist-meta">
        <span class="hist-type">${item.site_type || 'custom'}</span>
        <span class="hist-time">${timeAgo(item.created_at)}</span>
      </div>`;
    el.addEventListener('click', () => {
      generatedCode = { html: item.html_output || '', css: item.css_output || '', js: item.js_output || '' };
      $('outputCard').style.display   = '';
      $('progressCard').style.display = 'none';
      $('skeletonCard').style.display = 'none';
      $('errorCard').style.display    = 'none';
      showTab('preview');
      renderPreview();
      if (window.innerWidth <= 768) { $('sidebar').classList.remove('open'); $('sidebarToggle').classList.remove('open'); }
      showToast('Build loaded', 'info');
    });
    list.insertBefore(el, empty);
  });
}

// ═══════════════════════════════════════════════════════════════
//  RETRY
// ═══════════════════════════════════════════════════════════════
$('retryBtn').addEventListener('click', () => {
  $('errorCard').style.display = 'none';
  const p = $('promptInput').value.trim();
  if (p) runGeneration(p);
});

// ═══════════════════════════════════════════════════════════════
//  TOASTS
// ═══════════════════════════════════════════════════════════════
function showToast(msg, type = 'info') {
  const icons = { success: '✓', error: '⚠', info: '◈', warn: '⚡' };
  const t = document.createElement('div');
  t.className = `toast t-${type}`;
  t.innerHTML = `<span>${icons[type] || '◈'}</span><span>${esc(msg)}</span>`;
  $('toastWrap').appendChild(t);
  setTimeout(() => { t.classList.add('leaving'); setTimeout(() => t.remove(), 220); }, 3200);
}

// ═══════════════════════════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════════════════════════
const delay   = ms => new Promise(r => setTimeout(r, ms));
const esc     = str => { const d = document.createElement('div'); d.appendChild(document.createTextNode(str)); return d.innerHTML; };
const timeAgo = iso => {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso);
  if (diff < 60000)    return 'just now';
  if (diff < 3600000)  return `${Math.floor(diff/60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
  return new Date(iso).toLocaleDateString();
};
