// ═══════════════════════════════════════════════════════════════
//  CLIX — script.js
//  Complete frontend logic
//  Auth · Quota · Generation · History · UI · Cursor · Toasts
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// ─── CONFIG — Replace with your actual Supabase values ──────────
const SUPABASE_URL  = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON = 'YOUR_SUPABASE_ANON_KEY';
const supabase      = createClient(SUPABASE_URL, SUPABASE_ANON);

// ─── CONSTANTS ───────────────────────────────────────────────────
const DAILY_USER_QUOTA = 3;
const GLOBAL_DAILY_CAP = 3000;
const OTP_EXPIRY_SECS  = 300;

// ─── STATE ───────────────────────────────────────────────────────
let currentUser      = null;
let userQuota        = DAILY_USER_QUOTA;
let adWatched        = false;
let selectedSiteType = 'landing';
let generatedCode    = { html: '', css: '', js: '' };
let otpTimer         = null;
let otpSecsLeft      = OTP_EXPIRY_SECS;
let currentEmail     = '';
let activeCodeFile   = 'html';

// ─── DOM REFS ────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// Screens
const screenHero    = $('screenHero');
const screenAuth    = $('screenAuth');
const screenBuilder = $('screenBuilder');

// Navbar
const navCenter   = $('navCenter');
const quotaPill   = $('quotaPill');
const quotaNum    = $('quotaNum');
const themeToggle = $('themeToggle');
const logoutBtn   = $('logoutBtn');
const counterFill = $('counterFill');
const counterLabel= $('counterLabel');

// Cap overlay
const capOverlay  = $('capOverlay');
const capHH       = $('capHH');
const capMM       = $('capMM');
const capSS       = $('capSS');
const capEmailInput=$('capEmailInput');
const capNotifyBtn= $('capNotifyBtn');

// Anon overlay
const anonOverlay  = $('anonOverlay');
const anonSignupBtn= $('anonSignupBtn');
const anonDismissBtn=$('anonDismissBtn');

// Auth
const heroGetStarted = $('heroGetStarted');
const authStepEmail  = $('authStepEmail');
const authStepOtp    = $('authStepOtp');
const emailInput     = $('emailInput');
const termsChk       = $('termsChk');
const sendOtpBtn     = $('sendOtpBtn');
const emailErr       = $('emailErr');
const otpEmailShow   = $('otpEmailShow');
const otpRow         = $('otpRow');
const otpCountdown   = $('otpCountdown');
const resendBtn      = $('resendBtn');
const verifyOtpBtn   = $('verifyOtpBtn');
const otpErr         = $('otpErr');
const authBackBtn    = $('authBackBtn');

// Builder sidebar
const sidebarToggle = $('sidebarToggle');
const sidebar       = $('sidebar');
const sbAvatar      = $('sbAvatar');
const sbEmail       = $('sbEmail');
const sbQuota       = $('sbQuota');
const typeGrid      = $('typeGrid');
const historyList   = $('historyList');
const histEmpty     = $('histEmpty');

// Builder main
const promptInput   = $('promptInput');
const charCount     = $('charCount');
const clearBtn      = $('clearBtn');
const gateNotice    = $('gateNotice');
const rewardedWrap  = $('rewardedWrap');
const devAdBtn      = $('devAdBtn');
const generateBtn   = $('generateBtn');
const genBtnText    = $('genBtnText');
const modelBadge    = $('modelBadge');
const modelName     = $('modelName');

// Progress
const progressCard  = $('progressCard');
const progressModel = $('progressModel');
const progressFill  = $('progressFill');
const skeletonCard  = $('skeletonCard');

// Output
const outputCard    = $('outputCard');
const tabPreviewBtn = $('tabPreviewBtn');
const tabCodeBtn    = $('tabCodeBtn');
const tabPreview    = $('tabPreview');
const tabCode       = $('tabCode');
const previewFrame  = $('previewFrame');
const copyBtn       = $('copyBtn');
const shareBtn      = $('shareBtn');
const downloadBtn   = $('downloadBtn');
const codeContent   = $('codeContent');
const shareModal    = $('shareModal');
const shareX        = $('shareX');
const shareWa       = $('shareWa');
const shareTg       = $('shareTg');
const shareClose    = $('shareClose');

// Error
const errorCard = $('errorCard');
const errorMsg  = $('errorMsg');
const retryBtn  = $('retryBtn');

// Toast
const toastWrap = $('toastWrap');

// ═══════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initCursor();
  initCounterRefresh();
  await checkSession();
});

// ═══════════════════════════════════════════════════════════════
//  THEME
// ═══════════════════════════════════════════════════════════════
function initTheme() {
  const saved = localStorage.getItem('clix-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next    = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('clix-theme', next);
});

// ═══════════════════════════════════════════════════════════════
//  CUSTOM CURSOR
// ═══════════════════════════════════════════════════════════════
function initCursor() {
  const cursor = $('cursor');
  const trail  = $('cursorTrail');
  if (!cursor || !trail) return;

  let mx = 0, my = 0, tx = 0, ty = 0;

  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    cursor.style.left = mx + 'px';
    cursor.style.top  = my + 'px';
  });

  function animTrail() {
    tx += (mx - tx) * 0.12;
    ty += (my - ty) * 0.12;
    trail.style.left = tx + 'px';
    trail.style.top  = ty + 'px';
    requestAnimationFrame(animTrail);
  }
  animTrail();
}

// ═══════════════════════════════════════════════════════════════
//  SESSION CHECK
// ═══════════════════════════════════════════════════════════════
async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();

  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      currentUser = session.user;
      await onUserLoggedIn();
    } else {
      currentUser = null;
      showScreen('hero');
    }
  });

  if (session?.user) {
    currentUser = session.user;
    await onUserLoggedIn();
  } else {
    showScreen('hero');
  }
}

async function onUserLoggedIn() {
  await checkGlobalCap();
  await loadUserQuota();
  await loadHistory();
  updateSidebarUser();
  showScreen('builder');
  showNavUserItems();
}

// ═══════════════════════════════════════════════════════════════
//  SCREEN MANAGEMENT
// ═══════════════════════════════════════════════════════════════
function showScreen(name) {
  screenHero.style.display    = 'none';
  screenAuth.style.display    = 'none';
  screenBuilder.style.display = 'none';

  if (name === 'hero')    { screenHero.style.display    = ''; }
  if (name === 'auth')    { screenAuth.style.display    = 'flex'; }
  if (name === 'builder') { screenBuilder.style.display = ''; }
}

function showNavUserItems() {
  quotaPill.style.display = 'inline-flex';
  logoutBtn.style.display = 'inline-flex';
}

function hideNavUserItems() {
  quotaPill.style.display = 'none';
  logoutBtn.style.display = 'none';
}

// ═══════════════════════════════════════════════════════════════
//  GLOBAL CAP
// ═══════════════════════════════════════════════════════════════
async function checkGlobalCap() {
  try {
    const { data } = await supabase
      .from('global_stats')
      .select('daily_count, last_reset')
      .eq('id', 1)
      .single();

    if (!data) return;

    // Check if we need to reset (new day)
    const lastReset = new Date(data.last_reset);
    const now       = new Date();
    const isNewDay  = now.toDateString() !== lastReset.toDateString();

    if (isNewDay) {
      await supabase
        .from('global_stats')
        .update({ daily_count: 0, last_reset: now.toISOString() })
        .eq('id', 1);
      updateCounter(0);
      return;
    }

    updateCounter(data.daily_count);

    if (data.daily_count >= GLOBAL_DAILY_CAP) {
      showCapOverlay();
    }
  } catch (e) {
    console.error('Cap check failed:', e);
  }
}

async function incrementGlobalCount() {
  const { data } = await supabase
    .from('global_stats')
    .select('daily_count')
    .eq('id', 1)
    .single();

  const newCount = (data?.daily_count || 0) + 1;
  await supabase
    .from('global_stats')
    .update({ daily_count: newCount })
    .eq('id', 1);

  updateCounter(newCount);

  if (newCount >= GLOBAL_DAILY_CAP) {
    showCapOverlay();
  }
}

function updateCounter(count) {
  const pct = Math.min((count / GLOBAL_DAILY_CAP) * 100, 100);
  counterFill.style.width = pct + '%';
  counterLabel.textContent = `${count.toLocaleString()} / ${GLOBAL_DAILY_CAP.toLocaleString()} today`;
  document.getElementById('counterTrack').setAttribute('aria-valuenow', count);
}

function initCounterRefresh() {
  // Refresh counter every 60 seconds
  setInterval(async () => {
    if (currentUser) await checkGlobalCap();
    else {
      const { data } = await supabase
        .from('global_stats')
        .select('daily_count')
        .eq('id', 1)
        .single();
      if (data) updateCounter(data.daily_count);
    }
  }, 60000);

  // Also load counter immediately for hero visitors
  supabase
    .from('global_stats')
    .select('daily_count')
    .eq('id', 1)
    .single()
    .then(({ data }) => { if (data) updateCounter(data.daily_count); });
}

// ─── Cap overlay ─────────────────────────────────────────────────
function showCapOverlay() {
  capOverlay.style.display = 'flex';
  startCapCountdown();
}

function startCapCountdown() {
  function tick() {
    const now      = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    const diff = Math.max(0, midnight - now);

    const hh = String(Math.floor(diff / 3600000)).padStart(2, '0');
    const mm = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
    const ss = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');

    capHH.textContent = hh;
    capMM.textContent = mm;
    capSS.textContent = ss;
  }
  tick();
  setInterval(tick, 1000);
}

capNotifyBtn.addEventListener('click', async () => {
  const email = capEmailInput.value.trim();
  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    showToast('Enter a valid email address', 'error');
    return;
  }
  // Store in Supabase — simple abuse_logs table re-used for notify
  await supabase.from('abuse_logs').insert({
    email,
    reason: 'cap_notify_request',
    ip_address: 'unknown'
  });
  capNotifyBtn.textContent = '✓ You\'re on the list!';
  capNotifyBtn.disabled = true;
  showToast('We\'ll email you at reset!', 'success');
});

// ═══════════════════════════════════════════════════════════════
//  ANONYMOUS OVERLAY
// ═══════════════════════════════════════════════════════════════
function showAnonOverlay() {
  anonOverlay.style.display = 'flex';
}

anonSignupBtn.addEventListener('click', () => {
  anonOverlay.style.display = 'none';
  showScreen('auth');
});

anonDismissBtn.addEventListener('click', () => {
  anonOverlay.style.display = 'none';
  showScreen('auth');
});

// ═══════════════════════════════════════════════════════════════
//  HERO
// ═══════════════════════════════════════════════════════════════
heroGetStarted.addEventListener('click', () => {
  if (currentUser) {
    showScreen('builder');
  } else {
    showScreen('auth');
  }
});

// ═══════════════════════════════════════════════════════════════
//  AUTH — EMAIL OTP via Supabase
// ═══════════════════════════════════════════════════════════════
sendOtpBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim().toLowerCase();

  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    showAuthError(emailErr, 'Enter a valid email address.');
    return;
  }
  if (!termsChk.checked) {
    showAuthError(emailErr, 'Please accept the Terms of Use to continue.');
    return;
  }

  sendOtpBtn.disabled = true;
  sendOtpBtn.textContent = 'Sending...';
  hideAuthError(emailErr);

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true }
    });

    if (error) throw error;

    currentEmail = email;
    otpEmailShow.textContent = email;
    authStepEmail.style.display = 'none';
    authStepOtp.style.display   = '';
    authBackBtn.style.display   = '';
    startOtpTimer();

    // Focus first OTP cell
    otpRow.querySelectorAll('.otp-cell')[0].focus();

  } catch (err) {
    showAuthError(emailErr, err.message || 'Failed to send code. Try again.');
  } finally {
    sendOtpBtn.disabled    = false;
    sendOtpBtn.textContent = 'Send code';
  }
});

// OTP cell auto-advance
otpRow.addEventListener('input', e => {
  const cell  = e.target;
  const idx   = parseInt(cell.dataset.idx);
  const cells = otpRow.querySelectorAll('.otp-cell');
  const val   = cell.value.replace(/\D/g, '');

  cell.value = val.slice(-1);

  if (val && idx < 5) {
    cells[idx + 1].focus();
  }

  cell.classList.toggle('filled', !!cell.value);

  // Auto verify when all 6 filled
  const allFilled = [...cells].every(c => c.value);
  if (allFilled) verifyOtpBtn.click();
});

otpRow.addEventListener('keydown', e => {
  const cell  = e.target;
  const idx   = parseInt(cell.dataset.idx);
  const cells = otpRow.querySelectorAll('.otp-cell');

  if (e.key === 'Backspace' && !cell.value && idx > 0) {
    cells[idx - 1].focus();
    cells[idx - 1].value = '';
    cells[idx - 1].classList.remove('filled');
  }
});

// Verify OTP
verifyOtpBtn.addEventListener('click', async () => {
  const cells = otpRow.querySelectorAll('.otp-cell');
  const token = [...cells].map(c => c.value).join('');

  if (token.length !== 6) {
    showAuthError(otpErr, 'Enter all 6 digits.');
    return;
  }

  verifyOtpBtn.disabled    = true;
  verifyOtpBtn.textContent = 'Verifying...';
  hideAuthError(otpErr);

  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email: currentEmail,
      token,
      type: 'email'
    });

    if (error) throw error;

    clearInterval(otpTimer);

    // Create profile if new user
    await ensureProfile(data.user);

    currentUser = data.user;
    await onUserLoggedIn();

  } catch (err) {
    showAuthError(otpErr, 'Invalid or expired code. Try again.');
    // Shake OTP cells
    otpRow.querySelectorAll('.otp-cell').forEach(c => {
      c.classList.add('shake');
      setTimeout(() => c.classList.remove('shake'), 500);
    });
  } finally {
    verifyOtpBtn.disabled    = false;
    verifyOtpBtn.textContent = 'Verify & enter';
  }
});

// Resend
resendBtn.addEventListener('click', async () => {
  resendBtn.disabled    = true;
  resendBtn.textContent = 'Sending...';

  try {
    await supabase.auth.signInWithOtp({ email: currentEmail });
    clearInterval(otpTimer);
    otpSecsLeft = OTP_EXPIRY_SECS;
    startOtpTimer();
    showToast('New code sent!', 'success');

    // Clear cells
    otpRow.querySelectorAll('.otp-cell').forEach(c => {
      c.value = '';
      c.classList.remove('filled');
    });
    otpRow.querySelectorAll('.otp-cell')[0].focus();
  } catch (err) {
    showToast('Failed to resend. Try again.', 'error');
  } finally {
    resendBtn.disabled    = false;
    resendBtn.textContent = 'Resend code';
  }
});

// Back button
authBackBtn.addEventListener('click', () => {
  clearInterval(otpTimer);
  authStepOtp.style.display   = 'none';
  authStepEmail.style.display = '';
  authBackBtn.style.display   = 'none';
  hideAuthError(otpErr);
  otpRow.querySelectorAll('.otp-cell').forEach(c => {
    c.value = '';
    c.classList.remove('filled');
  });
});

function startOtpTimer() {
  otpSecsLeft = OTP_EXPIRY_SECS;
  clearInterval(otpTimer);
  otpTimer = setInterval(() => {
    otpSecsLeft--;
    const m = Math.floor(otpSecsLeft / 60);
    const s = String(otpSecsLeft % 60).padStart(2, '0');
    otpCountdown.textContent = `${m}:${s}`;
    if (otpSecsLeft <= 0) {
      clearInterval(otpTimer);
      otpCountdown.textContent = 'Expired';
      showAuthError(otpErr, 'Code expired. Click "Resend code".');
    }
  }, 1000);
}

function showAuthError(el, msg) {
  el.textContent    = msg;
  el.style.display  = '';
}
function hideAuthError(el) {
  el.style.display  = 'none';
  el.textContent    = '';
}

// ─── Create/verify profile ────────────────────────────────────
async function ensureProfile(user) {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single();

    if (!data) {
      await supabase.from('profiles').insert({
        id:       user.id,
        email:    user.email,
        last_seen: new Date().toISOString()
      });
    } else {
      await supabase.from('profiles')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', user.id);
    }
  } catch (e) {
    console.error('Profile error:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
//  LOGOUT
// ═══════════════════════════════════════════════════════════════
logoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut();
  currentUser = null;
  adWatched   = false;
  hideNavUserItems();
  showScreen('hero');
  showToast('Logged out successfully', 'info');
});

// ═══════════════════════════════════════════════════════════════
//  USER QUOTA
// ═══════════════════════════════════════════════════════════════
async function loadUserQuota() {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('daily_count, quota_reset_at')
      .eq('id', currentUser.id)
      .single();

    if (!data) return;

    // Reset if new day
    const resetAt = new Date(data.quota_reset_at);
    const now     = new Date();
    if (now.toDateString() !== resetAt.toDateString()) {
      await supabase.from('profiles')
        .update({ daily_count: 0, quota_reset_at: now.toISOString() })
        .eq('id', currentUser.id);
      userQuota = DAILY_USER_QUOTA;
    } else {
      userQuota = Math.max(0, DAILY_USER_QUOTA - (data.daily_count || 0));
    }

    updateQuotaUI();
  } catch (e) {
    console.error('Quota load failed:', e);
  }
}

async function incrementUserQuota() {
  const { data } = await supabase
    .from('profiles')
    .select('daily_count')
    .eq('id', currentUser.id)
    .single();

  const newCount = (data?.daily_count || 0) + 1;
  await supabase.from('profiles')
    .update({ daily_count: newCount })
    .eq('id', currentUser.id);

  userQuota = Math.max(0, DAILY_USER_QUOTA - newCount);
  updateQuotaUI();
}

function updateQuotaUI() {
  quotaNum.textContent  = userQuota;
  sbQuota.textContent   = `${userQuota} build${userQuota !== 1 ? 's' : ''} left today`;

  if (userQuota === 0) {
    generateBtn.disabled = true;
    genBtnText.textContent = 'Daily limit reached';
    showToast('You\'ve used all 3 daily builds. Come back tomorrow!', 'warn');
  }
}

// ═══════════════════════════════════════════════════════════════
//  SIDEBAR USER
// ═══════════════════════════════════════════════════════════════
function updateSidebarUser() {
  if (!currentUser) return;
  const email   = currentUser.email || '';
  sbEmail.textContent  = email;
  sbAvatar.textContent = email.charAt(0).toUpperCase();
}

// ═══════════════════════════════════════════════════════════════
//  SIDEBAR TOGGLE (mobile)
// ═══════════════════════════════════════════════════════════════
sidebarToggle.addEventListener('click', () => {
  const open = sidebar.classList.toggle('open');
  sidebarToggle.classList.toggle('open', open);
  sidebarToggle.setAttribute('aria-expanded', open);
});

// Close sidebar on outside click (mobile)
document.addEventListener('click', e => {
  if (window.innerWidth <= 768 &&
      sidebar.classList.contains('open') &&
      !sidebar.contains(e.target) &&
      !sidebarToggle.contains(e.target)) {
    sidebar.classList.remove('open');
    sidebarToggle.classList.remove('open');
    sidebarToggle.setAttribute('aria-expanded', false);
  }
});

// ═══════════════════════════════════════════════════════════════
//  SITE TYPE SELECTOR
// ═══════════════════════════════════════════════════════════════
typeGrid.addEventListener('click', e => {
  const btn = e.target.closest('.type-btn');
  if (!btn) return;

  typeGrid.querySelectorAll('.type-btn').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-checked', 'false');
  });
  btn.classList.add('active');
  btn.setAttribute('aria-checked', 'true');
  selectedSiteType = btn.dataset.type;
});

// ═══════════════════════════════════════════════════════════════
//  PROMPT INPUT
// ═══════════════════════════════════════════════════════════════
promptInput.addEventListener('input', () => {
  const len = promptInput.value.length;
  charCount.textContent = `${len} / 1000`;
});

clearBtn.addEventListener('click', () => {
  promptInput.value     = '';
  charCount.textContent = '0 / 1000';
  promptInput.focus();
});

// ═══════════════════════════════════════════════════════════════
//  AD GATE
// ═══════════════════════════════════════════════════════════════
// Show rewarded ad area when builder loads
function initAdGate() {
  rewardedWrap.style.display = '';
}

// Called by real Adsterra script when ad completes
window.onAdComplete = function () {
  adWatched = true;
  gateNotice.style.display   = 'none';
  rewardedWrap.style.display = 'none';

  if (userQuota > 0) {
    generateBtn.disabled       = false;
    genBtnText.textContent     = 'Generate website';
  }
  showToast('Ad complete — you\'re ready to build!', 'success');
};

// DEV ONLY simulate button
if (devAdBtn) {
  devAdBtn.addEventListener('click', () => window.onAdComplete());
}

// ═══════════════════════════════════════════════════════════════
//  GENERATION
// ═══════════════════════════════════════════════════════════════
generateBtn.addEventListener('click', async () => {
  if (!currentUser) { showAnonOverlay(); return; }

  const prompt = promptInput.value.trim();
  if (!prompt) {
    showToast('Describe the site you want to build first.', 'warn');
    promptInput.focus();
    return;
  }
  if (!adWatched) {
    showToast('Watch the short ad first to unlock generation.', 'warn');
    return;
  }
  if (userQuota <= 0) {
    showToast('Daily limit reached. Come back tomorrow!', 'warn');
    return;
  }

  await runGeneration(prompt);
});

async function runGeneration(prompt) {
  // Hide previous output/error
  outputCard.style.display  = 'none';
  errorCard.style.display   = 'none';
  skeletonCard.style.display= '';
  progressCard.style.display= '';
  generateBtn.disabled      = true;
  genBtnText.textContent    = 'Building...';

  // Reset progress steps
  setProgressStep(1);
  setProgressWidth(5);

  // Reset ad gate for next generation
  adWatched = false;

  try {
    // Step 1 → 2
    await delay(600);
    setProgressStep(2);
    setProgressWidth(25);

    // Call backend API
    const response = await fetch('/api/generate', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        prompt,
        siteType:  selectedSiteType,
        userToken: (await supabase.auth.getSession()).data.session?.access_token
      })
    });

    setProgressStep(3);
    setProgressWidth(55);
    await delay(400);

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Generation failed');
    }

    const data = await response.json();

    setProgressStep(4);
    setProgressWidth(80);
    await delay(400);

    // Update model name badge
    if (data.modelUsed) {
      const short = data.modelUsed.split('/').pop().replace(':free', '');
      modelName.textContent = short;
      progressModel.textContent = `Used ${short}`;
    }

    setProgressStep(5);
    setProgressWidth(100);
    await delay(500);

    // Store generated code
    generatedCode = {
      html: data.html || '',
      css:  data.css  || '',
      js:   data.js   || ''
    };

    // Update quota + global counter
    await incrementUserQuota();
    await incrementGlobalCount();

    // Save to history
    await saveGeneration(prompt, data);

    // Show output
    progressCard.style.display  = 'none';
    skeletonCard.style.display  = 'none';
    outputCard.style.display    = '';
    showTab('preview');
    renderPreview();

    // Reload ad gate for next time
    gateNotice.style.display   = '';
    rewardedWrap.style.display = '';
    generateBtn.disabled       = true;
    genBtnText.textContent     = 'Generate website';

    showToast('Your site is ready! 🎉', 'success');

  } catch (err) {
    console.error('Generation error:', err);
    progressCard.style.display  = 'none';
    skeletonCard.style.display  = 'none';
    errorCard.style.display     = '';
    errorMsg.textContent        = err.message || 'Something went wrong. Try again.';

    // Re-enable if quota not used (generation failed)
    if (adWatched) generateBtn.disabled = false;
    genBtnText.textContent = 'Generate website';

  }
}

function setProgressStep(n) {
  for (let i = 1; i <= 5; i++) {
    const el = $(`ps${i}`);
    if (!el) continue;
    el.classList.remove('active', 'done');
    if (i < n)  el.classList.add('done');
    if (i === n) el.classList.add('active');
  }
}

function setProgressWidth(pct) {
  progressFill.style.width = pct + '%';
}

// ═══════════════════════════════════════════════════════════════
//  PREVIEW & CODE TABS
// ═══════════════════════════════════════════════════════════════
tabPreviewBtn.addEventListener('click', () => showTab('preview'));
tabCodeBtn.addEventListener('click',   () => showTab('code'));

function showTab(name) {
  tabPreview.style.display = name === 'preview' ? '' : 'none';
  tabCode.style.display    = name === 'code'    ? '' : 'none';
  tabPreviewBtn.classList.toggle('active', name === 'preview');
  tabCodeBtn.classList.toggle('active',    name === 'code');
  if (name === 'code') renderCode(activeCodeFile);
}

function renderPreview() {
  const combined = buildFullHTML();
  previewFrame.srcdoc = combined;
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

// Code file tabs
document.querySelectorAll('.cf-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cf-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCodeFile = btn.dataset.file;
    renderCode(activeCodeFile);
  });
});

function renderCode(file) {
  const map = { html: generatedCode.html, css: generatedCode.css, js: generatedCode.js };
  codeContent.textContent = map[file] || '// Empty';
}

// ═══════════════════════════════════════════════════════════════
//  COPY CODE
// ═══════════════════════════════════════════════════════════════
copyBtn.addEventListener('click', async () => {
  const map = { html: generatedCode.html, css: generatedCode.css, js: generatedCode.js };
  const text = map[activeCodeFile] || buildFullHTML();

  try {
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = '✓ Copied!';
    setTimeout(() => { copyBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy'; }, 2000);
    showToast('Code copied to clipboard!', 'success');
  } catch {
    showToast('Copy failed — try manually selecting the code.', 'error');
  }
});

// ═══════════════════════════════════════════════════════════════
//  DOWNLOAD ZIP
// ═══════════════════════════════════════════════════════════════
downloadBtn.addEventListener('click', async () => {
  if (!generatedCode.html && !generatedCode.css) {
    showToast('Nothing to download yet.', 'warn');
    return;
  }

  try {
    const zip = new JSZip();
    zip.file('index.html', buildFullHTML());
    zip.file('style.css',  generatedCode.css  || '/* Generated by CLIX */');
    zip.file('script.js',  generatedCode.js   || '// Generated by CLIX');
    zip.file('README.md',  `# Built with CLIX ✦\n\nGenerated by CLIX — https://clix.app\n\n## Files\n- index.html\n- style.css\n- script.js\n`);

    const blob = await zip.generateAsync({ type: 'blob' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'clix-site.zip';
    a.click();
    URL.revokeObjectURL(url);
    showToast('ZIP downloaded!', 'success');
  } catch (err) {
    showToast('Download failed. Try again.', 'error');
  }
});

// ═══════════════════════════════════════════════════════════════
//  SHARE
// ═══════════════════════════════════════════════════════════════
shareBtn.addEventListener('click', () => {
  const text = encodeURIComponent('I just built a website in seconds with CLIX — free AI website builder! 🚀 https://clix.app');
  shareX.href  = `https://twitter.com/intent/tweet?text=${text}`;
  shareWa.href = `https://wa.me/?text=${text}`;
  shareTg.href = `https://t.me/share/url?url=https://clix.app&text=${encodeURIComponent('I just built a website with CLIX — free AI website builder! 🚀')}`;
  shareModal.style.display = '';
});

shareClose.addEventListener('click', () => {
  shareModal.style.display = 'none';
});

// ═══════════════════════════════════════════════════════════════
//  HISTORY
// ═══════════════════════════════════════════════════════════════
async function saveGeneration(prompt, data) {
  if (!currentUser) return;

  const title = prompt.slice(0, 45) + (prompt.length > 45 ? '...' : '');

  try {
    await supabase.from('generations').insert({
      user_id:    currentUser.id,
      prompt,
      title,
      site_type:  selectedSiteType,
      model_used: data.modelUsed || 'unknown',
      html_output: data.html || '',
      css_output:  data.css  || '',
      js_output:   data.js   || ''
    });

    await loadHistory();
  } catch (e) {
    console.error('History save failed:', e);
  }
}

async function loadHistory() {
  if (!currentUser) return;

  try {
    const { data } = await supabase
      .from('generations')
      .select('id, title, site_type, created_at, html_output, css_output, js_output, prompt')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(20);

    renderHistory(data || []);
  } catch (e) {
    console.error('History load failed:', e);
  }
}

function renderHistory(items) {
  if (!items.length) {
    histEmpty.style.display = '';
    return;
  }

  histEmpty.style.display = 'none';

  // Clear old items (keep histEmpty)
  historyList.querySelectorAll('.hist-item').forEach(el => el.remove());

  items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'hist-item';
    el.innerHTML = `
      <div class="hist-prompt">${escHtml(item.title || item.prompt)}</div>
      <div class="hist-meta">
        <span class="hist-type">${item.site_type || 'custom'}</span>
        <span class="hist-time">${formatTime(item.created_at)}</span>
      </div>
    `;

    el.addEventListener('click', () => {
      generatedCode = {
        html: item.html_output || '',
        css:  item.css_output  || '',
        js:   item.js_output   || ''
      };
      outputCard.style.display   = '';
      progressCard.style.display = 'none';
      skeletonCard.style.display = 'none';
      errorCard.style.display    = 'none';
      showTab('preview');
      renderPreview();

      // Close sidebar on mobile
      if (window.innerWidth <= 768) {
        sidebar.classList.remove('open');
        sidebarToggle.classList.remove('open');
      }

      showToast('Previous build loaded', 'info');
    });

    historyList.insertBefore(el, histEmpty);
  });
}

// ═══════════════════════════════════════════════════════════════
//  RETRY
// ═══════════════════════════════════════════════════════════════
retryBtn.addEventListener('click', () => {
  errorCard.style.display = 'none';
  if (promptInput.value.trim()) {
    runGeneration(promptInput.value.trim());
  }
});

// ═══════════════════════════════════════════════════════════════
//  TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════
function showToast(msg, type = 'info') {
  const icons = { success: '✓', error: '⚠', info: '◈', warn: '⚡' };
  const toast = document.createElement('div');
  toast.className = `toast t-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || '◈'}</span><span class="toast-msg">${escHtml(msg)}</span>`;
  toastWrap.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

// ═══════════════════════════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════════════════════════
function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function escHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}

function formatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000)   return 'just now';
  if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
  if (diff < 86400000)return `${Math.floor(diff/3600000)}h ago`;
  return d.toLocaleDateString();
}

// ─── Init ad gate when builder shown ─────────────────────────
const builderObserver = new MutationObserver(() => {
  if (screenBuilder.style.display !== 'none') {
    initAdGate();
  }
});
builderObserver.observe(screenBuilder, { attributes: true, attributeFilter: ['style'] });
