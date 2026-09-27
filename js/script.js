/* ---------- premium visual polish helpers (frontend-only) ---------- */
  let cyhRevealObserver = null;
  const cyhReducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function cyhReveal(root=document){
    if(cyhReducedMotion()){
      root.querySelectorAll?.('.cyh-reveal').forEach(el => el.classList.add('cyh-visible'));
      return;
    }
    if(!cyhRevealObserver){
      cyhRevealObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if(entry.isIntersecting){ entry.target.classList.add('cyh-visible'); cyhRevealObserver.unobserve(entry.target); }
        });
      }, {threshold:.08, rootMargin:'0px 0px -30px 0px'});
    }
    root.querySelectorAll?.('.cyh-reveal:not(.cyh-visible)').forEach(el => cyhRevealObserver.observe(el));
  }

  function cyhPrepareReveal(root=document){
    const selectors=['.panel-block','.stat-card','.chal-card','.community-post','.phase8-badge-card','.admin-challenge-row','.lb-row','.home-glance-card','.home-os-card','.home-loop-body','.home-live-card','.profile-card','.profile-figure','.profile-panel','.flagdesk-console','.board-table-panel','.board-podium','.home-final-cta','.qa-btn','.settings-card'];
    const selectorText=selectors.join(',');
    if(root.matches?.(selectorText)) root.classList.add('cyh-reveal');
    root.querySelectorAll?.(selectorText).forEach(el => el.classList.add('cyh-reveal'));
    root.querySelectorAll?.('.stat-cards,.home-live-grid,.home-glance-grid,.home-loop,.home-os-grid,.home-pulse-board,.achv-grid,.admin-challenge-list,.community-posts,.board-podium').forEach(el => el.classList.add('cyh-stagger'));
    cyhReveal(root);
  }

  function cyhAnimateProgress(root=document){
    if(root.matches?.('.skill-fill')) root.dataset.cyhProgressReady=root.dataset.cyhProgressReady||'0';
    root.querySelectorAll?.('.skill-fill').forEach(el => {
      if(el.dataset.cyhProgressReady==='1') return;
      const target=el.style.width||'0%'; el.dataset.cyhProgressTarget=target; el.dataset.cyhProgressReady='1';
      if(cyhReducedMotion()) return;
      el.style.width='0%';
      requestAnimationFrame(()=>requestAnimationFrame(()=>{el.classList.add('cyh-progress','cyh-progress-ready');el.style.width=target;}));
    });
  }

  function cyhPageEnter(view){
    if(!view || cyhReducedMotion()) return;
    view.classList.remove('cyh-page-enter'); void view.offsetWidth; view.classList.add('cyh-page-enter');
    setTimeout(()=>view.classList.remove('cyh-page-enter'),620);
  }

  function cyhCountValue(el,nextText){
    if(!el||cyhReducedMotion()) return;
    const raw=String(nextText??'').trim(); if(!/^#?\d[\d,]*(?:\.\d+)?$/.test(raw)) return;
    const prefix=raw.startsWith('#')?'#':''; const numeric=Number(raw.replace(/[#,]/g,''));
    if(!Number.isFinite(numeric)||numeric>1000000000) return;
    const previous=Number((el.dataset.cyhLastValue||'').replace(/[#,]/g,''));
    if(!Number.isFinite(previous)||previous===numeric) return;
    const start=performance.now(),duration=520;
    const tick=now=>{const t=Math.min(1,(now-start)/duration),eased=1-Math.pow(1-t,3);el.textContent=prefix+Math.round(previous+(numeric-previous)*eased).toLocaleString();if(t<1)requestAnimationFrame(tick);else el.textContent=raw;};
    requestAnimationFrame(tick);
  }

  function cyhInstallValueObserver(){
    const targets='.sc-value,.lb-pts-cell,.home-lb-points,.lb-selected-points,.home-live-value,.home-pulse-points,.home-pulse-facts dd,.profile-figure-value';
    document.querySelectorAll(targets).forEach(el=>{el.dataset.cyhLastValue=el.textContent.trim();});
    const observer=new MutationObserver(mutations=>mutations.forEach(m=>{
      const el=m.target?.nodeType===1?m.target:m.target?.parentElement;
      if(!el||!el.matches?.(targets)) return;
      const next=el.textContent.trim(); const previous=el.dataset.cyhLastValue||'';
      if(next&&next!==previous){el.dataset.cyhLastValue=next;if(previous)cyhCountValue(el,next);}
    }));
    observer.observe(document.body,{subtree:true,characterData:true,childList:true});
  }

  function cyhDecorateSubmitState(form,state){
    if(!form) return;
    form.classList.remove('cyh-submit-success','cyh-submit-error','cyh-submit-loading');
    if(state) form.classList.add('cyh-submit-'+state);
    if(state&&state!=='loading') setTimeout(()=>form.classList.remove('cyh-submit-'+state),700);
  }

  function cyhInitVisualPolish(){
    cyhPrepareReveal(document); cyhAnimateProgress(document); cyhInstallValueObserver();
    const observer=new MutationObserver(mutations => {
      mutations.forEach(m => {
        m.addedNodes.forEach(node => {
          if(node.nodeType===1){
            cyhPrepareReveal(node);
            cyhAnimateProgress(node);
          }
        });
      });
    });
    observer.observe(document.querySelector('main')||document.body,{childList:true,subtree:true});
  }

/* ---------- view + scroll navigation ---------- */
  let activeViewName = 'landing';

  /* OBFUSCATION, NOT A SECURITY BOUNDARY: the real boundary is
     requireAuth + requireAdmin on every /api/admin route.  This fixed
     double-base64 value only keeps the console out of ordinary navigation. */
  const HIDDEN_ENTRY_TOKEN = 'WTNsb0xXOXdjeTEyWVhWc2RBPT0=';
  let panelEntryAuthorized = false;
  let panelEntryRequested = false;

  /* Public routes are intentionally explicit. A guest may read the landing,
     about, and rules pages, and may always complete an auth flow; every other
     surface is a server-backed account view. */
  const PRIMARY_NAV_ITEMS = Object.freeze(['home', 'about', 'rules', 'teams', 'challenges', 'leaderboard', 'submit-flag']);
  const GUEST_ALLOWED_VIEWS = new Set([
    'landing', 'home', 'about', 'rules',
    'login', 'signup', 'verify-email'
  ]);

  function normalizeViewName(name){
    const value = String(name || 'landing').toLowerCase();
    return value === 'home' ? 'landing' : value;
  }

  function isViewAllowed(view){
    const normalized = normalizeViewName(view);
    if(GUEST_ALLOWED_VIEWS.has(normalized)) return true;
    return !!currentUser;
  }

  function consumeHiddenEntry(){
    let matched = false;
    let changed = false;
    const params = new URLSearchParams(window.location.search || '');
    const queryToken = params.has('panel') ? params.get('panel') : null;
    if(params.has('panel')){
      params.delete('panel');
      changed = true;
    }
    let hashToken = null;
    const rawHash = (window.location.hash || '').replace(/^#/, '');
    if(rawHash && !rawHash.includes('?')){
      try{ hashToken = decodeURIComponent(rawHash); }catch(_){ hashToken = rawHash; }
      if(hashToken === HIDDEN_ENTRY_TOKEN || rawHash === HIDDEN_ENTRY_TOKEN){
        changed = true;
        window.history.replaceState(null, document.title, window.location.pathname + (params.toString() ? '?' + params.toString() : ''));
      }
    }
    if(changed && !rawHash){
      window.history.replaceState(null, document.title, window.location.pathname + (params.toString() ? '?' + params.toString() : ''));
    }else if(changed && rawHash && hashToken !== HIDDEN_ENTRY_TOKEN && rawHash !== HIDDEN_ENTRY_TOKEN){
      window.history.replaceState(null, document.title, window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash);
    }
    matched = queryToken === HIDDEN_ENTRY_TOKEN || hashToken === HIDDEN_ENTRY_TOKEN;
    if(matched){ panelEntryRequested = true; }
    return matched;
  }

  const panelEntryOnInitialLocation = consumeHiddenEntry();
  window.addEventListener('hashchange', () => {
    const matched = consumeHiddenEntry();
    if(matched){
      void openHiddenPanelIfAllowed();
    }else if(panelEntryAuthorized && activeViewName === 'admin'){
      panelEntryAuthorized = false;
      currentNav = 'home';
      updateActiveNav();
      showView('landing');
    }
  });

  function guardViewRoute(view, action){
    if(isViewAllowed(view)) return true;
    redirectToLoginFromNav(action);
    return false;
  }

  function showLandingNotice(message){
    const notice = document.getElementById('landing-access-notice');
    const text = document.getElementById('landing-access-notice-text');
    if(text) text.textContent = message || 'Sign in to continue.';
    if(notice) notice.hidden = false;
  }

  function clearLandingNotice(){
    const notice = document.getElementById('landing-access-notice');
    if(notice) notice.hidden = true;
  }

  function showView(name){
    const normalized = normalizeViewName(name);
    if(normalized === 'admin' && !panelEntryAuthorized) return false;
    if(normalized !== 'admin' && activeViewName === 'admin'){ panelEntryAuthorized = false; opsStopLogTimer(); }
    const view = document.getElementById('view-' + normalized);
    if(!view) return false;
    if(!isViewAllowed(normalized)){
      /* This is the single access-control choke point. Do not reveal a
         protected surface to a guest, even if a deep link bypassed navGo. */
      closeMobileMenu();
      closeAvatarMenu();
      currentNav = 'home';
      updateActiveNav();
      syncAccountSubnav(null);
      showLandingNotice('Sign in to continue to that space.');
      const landing = document.getElementById('view-landing');
      if(landing){
        document.querySelectorAll('.view.active').forEach(v => v.classList.remove('active'));
        landing.classList.add('active');
        activeViewName = 'landing';
        cyhPageEnter(landing);
        requestAnimationFrame(()=>{cyhPrepareReveal(landing);cyhAnimateProgress(landing);});
      }
      window.scrollTo({top:0, behavior:'smooth'});
      return false;
    }
    const alreadyActive = activeViewName === normalized && view.classList.contains('active');
    if(normalized === 'landing'){ clearLandingNotice(); void refreshHomeLiveStats(); }
    if(alreadyActive){
      requestAnimationFrame(()=>{cyhPrepareReveal(view);cyhAnimateProgress(view);});
      return false;
    }
    document.querySelectorAll('.view.active').forEach(v => v.classList.remove('active'));
    view.classList.add('active');
    activeViewName = normalized;
    cyhPageEnter(view);
    syncAccountSubnav(currentUser);
    requestAnimationFrame(()=>{cyhPrepareReveal(view);cyhAnimateProgress(view);});
    return true;
  }

  function goTo(view, anchorId){
    const normalized = normalizeViewName(view);
    if(normalized === 'admin'){
      void goToAdmin();
      return;
    }
    if(!isViewAllowed(normalized)){
      redirectToLoginFromNav('continue');
      return;
    }
    const viewEl = document.getElementById('view-' + normalized);
    if(!viewEl) return;
    const wasActive = viewEl.classList.contains('active');
    showView(normalized);
    if(anchorId){
      const scrollNow = () => {
        const el = document.getElementById(anchorId);
        if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
      };
      wasActive ? scrollNow() : setTimeout(scrollNow, 60);
    } else {
      window.scrollTo({top:0, behavior:'smooth'});
    }
  }

  /* ---------- main navigation system ---------- */
  let currentNav = 'home';
  // Monotonic request sequence counters: guards against out-of-order async
  // responses clobbering newer data (e.g. fast pagination clicks).
  let activitySeq = 0;
  let communitySeq = 0;
  let activityOffset = 0;
  const activityPageSize = 20;

  function updateActiveNav(){
    document.querySelectorAll('[data-nav]').forEach(el => {
      const inPrimaryNav = el.closest('.links, .mm-links');
      const active = !!currentNav && el.dataset.nav === currentNav && (!inPrimaryNav || PRIMARY_NAV_ITEMS.includes(el.dataset.nav));
      el.classList.toggle('active', active);
      if(active) el.setAttribute('aria-current','page');
      else el.removeAttribute('aria-current');
    });
  }

  function navGo(name){
    closeMobileMenu();
    closeAvatarMenu();
    const normalized = normalizeViewName(name);
    if(!isViewAllowed(normalized)){
      redirectToLoginFromNav('continue');
      return;
    }
    switch(name){
      case 'landing':
      case 'home':
        currentNav = 'home'; updateActiveNav();
        goTo('landing');
        break;
      case 'about':
        currentNav = 'about'; updateActiveNav();
        goTo('about');
        break;
      case 'rules':
        currentNav = 'rules'; updateActiveNav();
        goTo('rules');
        break;
      case 'teams':
        void goToTeams();
        break;
      case 'challenges':
        void goToChallenges();
        break;
      case 'leaderboard':
        void goToLeaderboard();
        break;
      case 'submit-flag':
        void goToSubmitFlag();
        break;
      case 'dashboard':
        void goToDashboard();
        break;
      case 'profile':
        void goToProfile();
        break;
      case 'badges':
        void goToBadges();
        break;
      case 'community':
        void goToCommunity();
        break;
      case 'events':
        void goToEvents();
        break;
      case 'activity':
        void goToActivity();
        break;
      case 'settings':
        void goToSettings();
        break;
      case 'login':
      case 'signup':
      case 'verify-email':
        currentNav = null; updateActiveNav(); goTo(name);
        break;
      case 'admin':
        void goToAdmin();
        break;
    }
  }

  function navGoAuth(view){
    closeMobileMenu();
    if(!isViewAllowed(view)){ redirectToLoginFromNav('continue'); return; }
    currentNav = null; updateActiveNav();
    goTo(view);
  }

  function redirectToLoginFromNav(action){
    currentNav = 'home';
    updateActiveNav();
    showView('landing');
    showLandingNotice('Sign in to ' + (action || 'continue') + '.');
    window.scrollTo({top:0, behavior:'smooth'});
  }

  /* avatar dropdown */
  let avatarMenuOpen = false;
  function toggleAvatarMenu(evt){
    evt.stopPropagation();
    avatarMenuOpen = !avatarMenuOpen;
    const dd = document.getElementById('avatar-dropdown');
    if(dd) dd.classList.toggle('open', avatarMenuOpen);
    const trigger = document.querySelector('.avatar-btn');
    if(trigger) trigger.setAttribute('aria-expanded', avatarMenuOpen ? 'true' : 'false');
  }
  function closeAvatarMenu(){
    avatarMenuOpen = false;
    const dd = document.getElementById('avatar-dropdown');
    if(dd) dd.classList.remove('open');
    const trigger = document.querySelector('.avatar-btn');
    if(trigger) trigger.setAttribute('aria-expanded', 'false');
  }
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('avatar-menu');
    if(menu && !menu.contains(e.target)) closeAvatarMenu();
  });

  /* mobile drawer */
  let mobileMenuOpen = false;
  let mobileReturnFocus = null;
  function toggleMobileMenu(){
    const mm = document.getElementById('mobile-menu');
    const hb = document.getElementById('hamburger-btn');
    if(!mm || !hb) return;
    if(mobileMenuOpen){
      closeMobileMenu();
      return;
    }
    mobileReturnFocus = document.activeElement;
    mobileMenuOpen = true;
    mm.classList.add('open');
    mm.setAttribute('aria-hidden','false');
    hb.classList.add('open');
    hb.setAttribute('aria-expanded','true');
    hb.setAttribute('aria-label','Close menu');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(()=>document.querySelector('#mm-links a, .mm-close')?.focus());
  }
  function closeMobileMenu(){
    const mm = document.getElementById('mobile-menu');
    const hb = document.getElementById('hamburger-btn');
    const wasOpen = mobileMenuOpen;
    mobileMenuOpen = false;
    if(mm){ mm.classList.remove('open'); mm.setAttribute('aria-hidden','true'); }
    if(hb){ hb.classList.remove('open'); hb.setAttribute('aria-expanded','false'); hb.setAttribute('aria-label','Open menu'); }
    document.body.style.overflow = '';
    if(wasOpen && mobileReturnFocus && typeof mobileReturnFocus.focus === 'function'){
      mobileReturnFocus.focus();
    }
    mobileReturnFocus = null;
  }

  function syncNavScrollState(){
    document.getElementById('site-header')?.classList.toggle('is-scrolled', window.scrollY > 12);
  }
  window.addEventListener('scroll', syncNavScrollState, {passive:true});
  syncNavScrollState();

  /* ---------- helpers ---------- */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function escapeHtml(value){
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]));
  }

  /* api.js intentionally keeps its request helper private. Teams are a
     forward-compatible surface being rolled out separately, so mirror that
     helper locally instead of coupling the existing API object to a route that
     may not exist in every deployment. */
  const cyhApiMeta = document.querySelector('meta[name="cyberyardhub-api-base"]');
  const cyhConfiguredApiBase = (cyhApiMeta && cyhApiMeta.content && cyhApiMeta.content.trim()) || window.CYBERYARDHUB_API_BASE_URL || '';
  const cyhApiBase = cyhConfiguredApiBase || ((window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:4000/api' : `${window.location.origin}/api`);

  async function apiRequest(path, { method = 'GET', body, timeoutMs = 20000 } = {}){
    let response;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 20000) : null;
    try{
      const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
      const headers = {};
      if(body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || window.CYBERYARDHUB_CSRF_TOKEN;
      if(csrfToken) headers['X-CSRF-Token'] = csrfToken;
      response = await fetch(cyhApiBase + path, {
        method,
        credentials: 'include',
        headers,
        body: body !== undefined ? (isFormData ? body : JSON.stringify(body)) : undefined,
        signal: controller ? controller.signal : undefined
      });
    }catch(error){
      if(timer) clearTimeout(timer);
      const err = new Error(error?.name === 'AbortError' ? 'The request timed out. Please try again.' : 'Unable to reach the server. Check your connection and try again.');
      err.isNetworkError = true;
      err.cause = error;
      throw err;
    }finally{
      if(timer) clearTimeout(timer);
    }
    let data = null;
    try{ data = await response.json(); }catch(_){ /* non-JSON error bodies are handled by status */ }
    if(!response.ok){
      const err = new Error(data?.error?.message || `Request failed (${response.status}).`);
      err.status = response.status;
      err.code = data?.error?.code;
      err.issues = data?.error?.issues;
      throw err;
    }
    return data;
  }

  const teams = {
    mine: () => apiRequest('/teams/mine'),
    leaderboard: (params = {}) => {
      const query = new URLSearchParams();
      if(params.limit !== undefined) query.set('limit', String(params.limit));
      if(params.offset !== undefined) query.set('offset', String(params.offset));
      const suffix = query.toString();
      return apiRequest('/teams/leaderboard' + (suffix ? '?' + suffix : ''));
    },
    create: (payload) => apiRequest('/teams', { method: 'POST', body: payload }),
    join: (payload) => apiRequest('/teams/join', { method: 'POST', body: payload }),
    leave: () => apiRequest('/teams/leave', { method: 'POST' }),
    regenerateCode: () => apiRequest('/teams/regenerate-code', { method: 'POST' })
  };
  window.CyberYardHubTeams = teams;
  if(window.CyberYardHubAPI && !window.CyberYardHubAPI.teams) window.CyberYardHubAPI.teams = teams;


  function setFieldError(fieldId, show){
    const el = document.getElementById(fieldId);
    if(!el) return;
    el.classList.toggle('has-error', show);
  }

  function showAlert(prefix, type, message){
    const errorEl = document.getElementById(prefix + '-alert-error');
    const successEl = document.getElementById(prefix + '-alert-success');
    if(errorEl) errorEl.classList.remove('show');
    if(successEl) successEl.classList.remove('show');
    const target = type === 'error' ? errorEl : successEl;
    if(target){
      target.querySelector('.am').textContent = message;
      target.classList.add('show');
    }
  }

  function clearAlerts(prefix){
    ['-alert-error','-alert-success'].forEach(s => {
      const el = document.getElementById(prefix + s);
      if(el) el.classList.remove('show');
    });
  }

  function togglePw(inputId, btn){
    const input = document.getElementById(inputId);
    if(!input || !btn) return;
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.classList.toggle('showing', !showing);
    btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    btn.setAttribute('aria-pressed', String(!showing));
  }

  /**
   * Pulls the first human-readable message out of a Zod flatten() payload
   * as returned by the backend's error responses ({ formErrors, fieldErrors }),
   * so a 400 response can surface something more specific than a generic
   * "check your details" line, without the frontend re-implementing the
   * backend's validation rules itself.
   */
  function firstZodMessage(issues){
    if(!issues) return null;
    if(Array.isArray(issues.formErrors) && issues.formErrors.length) return issues.formErrors[0];
    if(issues.fieldErrors){
      for(const key of Object.keys(issues.fieldErrors)){
        const msgs = issues.fieldErrors[key];
        if(Array.isArray(msgs) && msgs.length) return msgs[0];
      }
    }
    return null;
  }

  function isUnauthorizedError(err){
    return !!err && err.status === 401;
  }

  /* ---------- localStorage storage shim ---------- */
  /* Non-sensitive, per-device UI preferences ONLY (theme, notification
     toggles) — see getUserSettings/saveUserSettings below. Authentication
     state does NOT live here: the server session (httpOnly cookie) is the
     sole source of truth for who's logged in, via /api/auth/*. Same shape
     for callers as the old artifact-only window.storage API:
     get(key) -> { value: string } | null ; set(key, value) ; delete(key) */
  const STORAGE_PREFIX = 'cyberyardhub:';

  const appStorage = {
    async get(key){
      try{
        if(typeof localStorage === 'undefined') return null;
        const raw = localStorage.getItem(STORAGE_PREFIX + key);
        if(raw === null || raw === undefined) return null;
        return { value: String(raw) };
      }catch(e){
        return null;
      }
    },
    async set(key, value){
      if(typeof localStorage === 'undefined'){
        throw new Error('localStorage is unavailable in this browser.');
      }
      try{
        localStorage.setItem(STORAGE_PREFIX + key, String(value));
      }catch(e){
        throw new Error('Unable to write to localStorage (quota or privacy mode).');
      }
    },
    async delete(key){
      try{
        if(typeof localStorage === 'undefined') return;
        localStorage.removeItem(STORAGE_PREFIX + key);
      }catch(e){ /* ignore */ }
    }
  };

  /* ---------- auth state (server session is authoritative) ---------- */
  /* `currentUser` is an in-memory cache of the last GET /api/auth/me (or
     register/login) response for the lifetime of this page load ONLY —
     it is never written to localStorage/sessionStorage. The real
     authentication state lives entirely in the server-side session,
     identified by the httpOnly cookie the browser sends automatically;
     this cache just avoids re-fetching /me before every single
     navigation. A full page reload always re-derives it from the server
     via refreshCurrentUser() (see the DOMContentLoaded handler at the
     bottom of this file), so a revoked/expired server session is never
     masked by stale local state surviving a reload. */
  let currentUser = null;

  async function refreshCurrentUser(){
    try{
      const data = await CyberYardHubAPI.auth.me();
      currentUser = data.user;
    }catch(e){
      currentUser = null;
    }
    return currentUser;
  }

  /* Kept as `getSession()` (same name/shape the rest of this file already
     called everywhere — username/email/createdAt) so every existing
     call site below needed no signature changes, just a different
     implementation underneath. */
  async function getSession(){
    return currentUser;
  }


  async function handleLogin(evt){
    evt.preventDefault();
    clearAlerts('login');
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-pass').value;
    const rememberMe = !!document.getElementById('login-remember')?.checked;

    let valid = true;
    const emailOk = EMAIL_RE.test(email);
    setFieldError('login-email-field', !emailOk); if(!emailOk) valid = false;
    setFieldError('login-pass-field', pass.length === 0); if(pass.length === 0) valid = false;
    if(!valid){
      const firstBad = document.querySelector('#login-form .authx-field.has-error input');
      if(firstBad && typeof firstBad.focus === 'function') firstBad.focus();
      return;
    }

    const submitBtn = evt.target.querySelector('button[type="submit"]');
    const submitLabel = submitBtn ? submitBtn.innerHTML : '';
    if(submitBtn){ submitBtn.disabled = true; submitBtn.textContent = 'Logging in…'; }

    try{
      const data = await CyberYardHubAPI.auth.login({ email, password: pass, rememberMe });
      currentUser = data.user;
      /* No "signed in successfully" banner: the dashboard that replaces this
         form is the confirmation. A toast here would only repeat it. */
      await refreshNavState();
      goToDashboard();
    }catch(e){
      if(e.isNetworkError){
        showAlert('login', 'error', e.message);
      } else if(e.status === 401){
        showAlert('login', 'error', 'Invalid email or password.');
      } else if(e.status === 429){
        showAlert('login', 'error', 'Too many attempts. Please wait a moment and try again.');
      } else if(e.status === 400){
        showAlert('login', 'error', firstZodMessage(e.issues) || 'Please check your details and try again.');
      } else {
        showAlert('login', 'error', e.message || 'Unable to log in right now. Please try again.');
      }
    }finally{
      if(submitBtn){ submitBtn.disabled = false; submitBtn.innerHTML = submitLabel; }
    }
  }

  /* ---------- password policy ----------
     Mirrors backend/src/validation/auth.schema.ts `passwordSchema`
     (min 8, max 128, at least one letter, at least one number). The old
     form only checked length, so a password that looked fine failed with
     an opaque server-side 400. Keeping the two in step is what makes
     registration feel like it "accepts" what you type. */
  const PASSWORD_MIN = 8;
  const PASSWORD_MAX = 128;

  function passwordPolicyIssues(value){
    const issues = [];
    if(value.length < PASSWORD_MIN) issues.push('length');
    if(!/[A-Za-z]/.test(value)) issues.push('letter');
    if(!/[0-9]/.test(value)) issues.push('number');
    return issues;
  }

  const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

  /* 0-4 score: length, letter, number, then a bonus for variety. */
  function passwordStrength(value){
    if(!value) return 0;
    let score = 0;
    if(value.length >= PASSWORD_MIN) score++;
    if(/[A-Za-z]/.test(value) && /[0-9]/.test(value)) score++;
    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(re => re.test(value)).length;
    if(score >= 2) score++;
    if(classes >= 4 && value.length >= 12) score++;
    if(passwordPolicyIssues(value).length) score = Math.min(score, 1);
    return Math.max(1, Math.min(4, score));
  }

  const STRENGTH_LABELS = { 1: 'Weak', 2: 'Fair', 3: 'Good', 4: 'Strong' };

  /* Live password feedback for the registration form: a strength bar plus a
     checklist that mirrors the server policy and the match check, so the
     rules are visible before submitting rather than reported afterwards. */
  function syncPasswordFeedback(){
    const passInput = document.getElementById('su-pass');
    const pass2Input = document.getElementById('su-pass2');
    if(!passInput) return;
    const pass = passInput.value;
    const pass2 = pass2Input ? pass2Input.value : '';

    const meter = document.getElementById('su-strength');
    if(meter){
      const level = passwordStrength(pass);
      meter.dataset.level = String(level);
      meter.classList.toggle('is-active', pass.length > 0);
      const label = meter.querySelector('.authx-meter-label');
      if(label) label.textContent = pass.length ? (STRENGTH_LABELS[level] || 'Strength') : 'Strength';
    }

    const rules = document.getElementById('su-rules');
    if(rules){
      const met = {
        length: pass.length >= PASSWORD_MIN && pass.length <= PASSWORD_MAX,
        letter: /[A-Za-z]/.test(pass),
        number: /[0-9]/.test(pass),
        match: pass2.length > 0 && pass === pass2
      };
      rules.querySelectorAll('[data-rule]').forEach(li => {
        li.dataset.met = met[li.dataset.rule] ? '1' : '0';
      });
    }

    /* Clear stale errors as soon as the corresponding input becomes valid,
       but never show an error before the field has been touched. */
    if(passInput.dataset.touched === '1'){
      setFieldError('su-pass-field', passwordPolicyIssues(pass).length > 0);
    }
    if(pass2Input && pass2Input.dataset.touched === '1'){
      setFieldError('su-pass2-field', !(pass2.length > 0 && pass === pass2));
    }
  }

  /* Mark a field as "touched" the first time focus leaves it, so validation
     errors appear on blur/input but never fire on an untouched empty field. */
  function markAuthFieldTouched(inputId){
    const input = document.getElementById(inputId);
    if(!input || input.dataset.touched === '1') return;
    input.dataset.touched = '1';
    input.addEventListener('blur', () => {
      validateAuthField(inputId);
      syncPasswordFeedback();
    });
  }

  function installAuthLiveValidation(){
    const pass = document.getElementById('su-pass');
    const pass2 = document.getElementById('su-pass2');
    if(pass) pass.addEventListener('input', syncPasswordFeedback);
    if(pass2) pass2.addEventListener('input', syncPasswordFeedback);
    ['su-user', 'su-email'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.addEventListener('input', () => { if(el.dataset.touched === '1') validateAuthField(id); });
    });
    /* Clear a standing "you must accept the Rules" error as soon as the box
       is ticked — otherwise it stayed on screen through a corrected submit. */
    const terms = document.getElementById('su-terms');
    if(terms) terms.addEventListener('change', () => {
      if(!terms.checked) return;
      document.getElementById('su-terms-field')?.classList.remove('has-error');
      document.getElementById('su-terms-error')?.classList.remove('show');
    });
  }

  /* Single place that decides whether one registration field is valid, so
     the blur handler, the live handler and the submit handler can never
     disagree with each other. */
  function validateAuthField(id){
    const el = document.getElementById(id);
    if(!el) return true;
    const value = el.value.trim();
    let ok = true;
    let fieldId = null;
    if(id === 'su-user'){ ok = USERNAME_RE.test(value); fieldId = 'su-user-field'; }
    else if(id === 'su-email'){ ok = EMAIL_RE.test(value); fieldId = 'su-email-field'; }
    else if(id === 'su-pass'){ ok = passwordPolicyIssues(el.value).length === 0; fieldId = 'su-pass-field'; }
    else if(id === 'su-pass2'){ ok = el.value.length > 0 && el.value === (document.getElementById('su-pass')?.value ?? ''); fieldId = 'su-pass2-field'; }
    if(fieldId) setFieldError(fieldId, !ok);
    return ok;
  }

  /* ---------- register ---------- */
  async function handleRegister(evt){
    evt.preventDefault();
    clearAlerts('signup');
    const username = document.getElementById('su-user').value.trim();
    const email = document.getElementById('su-email').value.trim();
    const pass = document.getElementById('su-pass').value;
    const pass2 = document.getElementById('su-pass2').value;
    const terms = document.getElementById('su-terms').checked;

    let valid = true;
    ['su-user', 'su-email', 'su-pass', 'su-pass2'].forEach(id => {
      if(!validateAuthField(id)) valid = false;
    });

    const termsWrap = document.getElementById('su-terms-field');
    const termsErr = document.getElementById('su-terms-error');
    if(termsWrap) termsWrap.classList.toggle('has-error', !terms);
    if(termsErr) termsErr.classList.toggle('show', !terms);
    if(!terms) valid = false;

    if(!valid){
      showAlert('signup', 'error', 'Fix the highlighted fields to create your account.');
      const firstBad = document.querySelector('#signup-form .authx-field.has-error input')
        || (terms ? null : document.getElementById('su-terms'));
      if(firstBad && typeof firstBad.focus === 'function') firstBad.focus();
      return;
    }

    const submitBtn = evt.target.querySelector('button[type="submit"]');
    const submitLabel = submitBtn ? submitBtn.innerHTML : '';
    if(submitBtn){ submitBtn.disabled = true; submitBtn.textContent = 'Creating account…'; }

    try{
      await CyberYardHubAPI.auth.register({ username, email, password: pass });
      currentUser = null;
      const confirmation = 'Account created. You can log in with these details now.';
      showAlert('signup', 'success', confirmation);
      evt.target.reset();
      resetPasswordFeedback();
      await refreshNavState();
      setTimeout(() => { goTo('login'); showAlert('login', 'success', confirmation); }, 1100);
    }catch(e){
      if(e.isNetworkError){
        showAlert('signup', 'error', e.message);
      } else if(e.status === 429){
        showAlert('signup', 'error', 'Too many attempts. Please wait a moment and try again.');
      } else if(e.status === 409){
        showAlert('signup', 'error', e.message || 'An account with that email or username already exists.');
      } else if(e.status === 400){
        showAlert('signup', 'error', firstZodMessage(e.issues) || 'Please check your details and try again.');
      } else {
        showAlert('signup', 'error', e.message || 'Unable to create your account right now. Please try again.');
      }
    }finally{
      if(submitBtn){ submitBtn.disabled = false; submitBtn.innerHTML = submitLabel; }
    }
  }

  function resetPasswordFeedback(){
    ['su-user', 'su-email', 'su-pass', 'su-pass2'].forEach(id => {
      const el = document.getElementById(id);
      if(el) delete el.dataset.touched;
      setFieldError(id + '-field', false);
    });
    const termsWrap = document.getElementById('su-terms-field');
    if(termsWrap) termsWrap.classList.remove('has-error');
    const termsErr = document.getElementById('su-terms-error');
    if(termsErr) termsErr.classList.remove('show');
    const meter = document.getElementById('su-strength');
    if(meter){
      meter.dataset.level = '0';
      meter.classList.remove('is-active');
      const label = meter.querySelector('.authx-meter-label');
      if(label) label.textContent = 'Strength';
    }
    const rules = document.getElementById('su-rules');
    if(rules) rules.querySelectorAll('[data-rule]').forEach(li => { li.dataset.met = '0'; });
  }

  /* ---------- logout ---------- */
  async function handleLogout(){
    try{
      await CyberYardHubAPI.auth.logout();
    }catch(e){
      /* Proceed to clear local UI state regardless — the user's intent is
         to leave the logged-in view either way, and a failed logout
         request at worst leaves a server session that expires on its own. */
    }
    currentUser = null;
    if(typeof opsIdentityExpiresAt !== 'undefined') opsIdentityExpiresAt = 0;
    stopRealtimeStream();
    await refreshNavState();
    currentNav = 'home'; updateActiveNav();
    goTo('landing');
  }

  /* ---------- shared user statistics rendering ---------- */
  function renderCategorySkills(stats, prefix){
    const desired = ['Web Exploitation', 'Cryptography', 'Forensics', 'Binary Exploitation'];
    desired.forEach((name, index) => {
      const stat = (stats.categories || []).find(c => c.name === name);
      const pct = stat ? stat.percentage : 0;
      setText(`${prefix}-skill-${index + 1}-label`, `${pct}%`);
      const fill = document.getElementById(`${prefix}-skill-${index + 1}-fill`);
      if(fill) fill.style.width = `${pct}%`;
    });
  }

  function relativeTime(value){
    const diff = Math.max(0, Date.now() - new Date(value).getTime());
    const minutes = Math.floor(diff / 60000);
    if(minutes < 1) return 'Just now';
    if(minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    const hours = Math.floor(minutes / 60);
    if(hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    if(days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
    return new Date(value).toLocaleDateString(undefined, {month:'short', day:'numeric'});
  }

  function applyUserStats(stats, prefix){
    setText(`${prefix}-points`, formatPoints(stats.points));
    setText(`${prefix}-rank`, `#${stats.rank}`);
    setText(`${prefix}-solved`, String(stats.solved));
    setText(`${prefix}-streak`, String(stats.currentStreak));
    if(prefix === 'dash') setText('dash-rank-tag', `Rank #${stats.rank}`);
    if(prefix === 'profile') setText('profile-hero-rank', `#${stats.rank}`);
    renderCategorySkills(stats, prefix);
  }

  async function loadUserStats(){
    const response = await CyberYardHubAPI.users.meStats();
    return response.stats;
  }

  /* ---------- protected dashboard route ---------- */
  async function renderDashboard(session){
    const initial = (session.username || '?').charAt(0).toUpperCase();
    setText('dash-username', session.username);
    setText('dash-email', session.email);
    setText('dash-username-2', session.username);
    setText('dash-email-2', session.email);
    setText('dash-avatar-initial-2', initial);
    setText('dash-date', new Date().toLocaleDateString(undefined, {weekday:'long', month:'long', day:'numeric'}));

    if(session.createdAt){
      const d = new Date(session.createdAt);
      setText('dash-since', d.toLocaleDateString(undefined, {month:'short', year:'numeric'}));
    } else {
      setText('dash-since', '—');
    }

    try{
      const stats = await loadUserStats();
      applyUserStats(stats, 'dash');
      await loadActivityPreview('dash-activity-list');
    }catch(e){
      if(isUnauthorizedError(e)){ redirectToLoginFromNav('access your dashboard'); return; }
      setText('dash-points', '—');
      setText('dash-rank', '—');
      setText('dash-solved', '—');
      setText('dash-streak', '—');
    }
    await loadProfileBadges();
  }

  function renderGamification(g, prefix){
    if(!g) return;
    setText(`${prefix}-level-label`, `Level ${g.level}`);
    setText(`${prefix}-xp-total`, `${formatPoints(g.totalXp)} XP`);
    setText(`${prefix}-xp-next`, g.xpToNextLevel > 0 ? `${formatPoints(g.xpToNextLevel)} XP to next level` : 'Max progression reached');
    const fill=document.getElementById(`${prefix}-xp-fill`); if(fill) fill.style.width=`${g.progressPercentage}%`;
    setText(`${prefix}-gam-streak`, `${g.currentStreak} day${g.currentStreak===1?'':'s'}`);
    setText(`${prefix}-longest-streak`, `${g.longestStreak} day${g.longestStreak===1?'':'s'}`);
    setText(`${prefix}-first-bloods`, String(g.firstBloodCount ?? g.firstBloods ?? 0));
    const ach=document.getElementById(`${prefix}-recent-achievements`);
    if(ach){ ach.innerHTML=(g.recentAchievements||[]).slice(0,4).map(a=>`<span class="p-tag accent">${escapeHtml(a.name)}</span>`).join('') || '<span class="ph-sub">No achievements yet</span>'; }
    const details=document.getElementById(`${prefix}-gam-progress-details`);
    if(details){
      const cats=(g.categories||[]).slice(0,4).map(c=>`<div class="gam-mini-progress"><span>${escapeHtml(c.name)}</span><b>${c.solved}/${c.available}</b></div>`).join('');
      const diffs=(g.difficulties||[]).map(d=>`<div class="gam-mini-progress"><span>${escapeHtml(d.name)}</span><b>${d.solved}/${d.available}</b></div>`).join('');
      details.innerHTML=`<div><div class="panel-kicker">CATEGORY PROGRESS</div>${cats||'<span class="ph-sub">No published challenges yet.</span>'}</div><div><div class="panel-kicker">DIFFICULTY PROGRESS</div>${diffs||'<span class="ph-sub">No published challenges yet.</span>'}</div>`;
    }
  }

  async function loadGamification(prefix, full=false){
    const response=await (full ? CyberYardHubAPI.gamification.progress() : CyberYardHubAPI.gamification.me());
    renderGamification(full ? response.progress : response.gamification, prefix);
    return full ? response.progress : response.gamification;
  }

  async function goToDashboard(){
    if(!guardViewRoute('dashboard','access your dashboard')) return;
    const session = await getSession();
    if(!session){ redirectToLoginFromNav('access your dashboard'); return; }
    currentNav = 'dashboard'; updateActiveNav();
    showView('dashboard');
    window.scrollTo({top:0, behavior:'auto'});
    await renderDashboard(session);
    try{ await loadGamification('dash', true); }catch(_){ /* progression is non-critical */ }
  }

  /* ---------- protected profile route ---------- */
  function setText(id, value){
    const el = document.getElementById(id);
    if(el) el.textContent = value;
  }

  /* Shared numeric presentation helper used by dashboard, leaderboard,
     challenge, admin, and landing-page views. */
  function formatPoints(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)) return '0';
    return numeric.toLocaleString('en-US');
  }

  function profileEditAlert(type, message){
    ['error','success'].forEach(t=>document.getElementById('profile-edit-'+t)?.classList.remove('show'));
    const el=document.getElementById('profile-edit-'+type);
    if(el){ el.querySelector('.am').textContent=message; el.classList.add('show'); }
  }
  async function openProfileEditor(){
    try{
      const response=await CyberYardHubAPI.users.meProfile(); const p=response.profile;
      document.getElementById('profile-edit-username').value=p.username||'';
      document.getElementById('profile-edit-avatar').value=p.avatarUrl||'';
      document.getElementById('profile-edit-bio').value=p.bio||'';
      document.getElementById('profile-editor')?.classList.remove('hidden');
      document.getElementById('profile-editor')?.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){ alert(e.message||'Unable to load your profile.'); }
  }
  function closeProfileEditor(){ document.getElementById('profile-editor')?.classList.add('hidden'); }
  async function submitProfileEditor(evt){
    evt.preventDefault();
    const payload={username:document.getElementById('profile-edit-username').value.trim(),bio:document.getElementById('profile-edit-bio').value.trim()};
    const avatar=document.getElementById('profile-edit-avatar').value.trim(); if(avatar) payload.avatarUrl=avatar; else payload.avatarUrl=null;
    try{
      const response=await CyberYardHubAPI.users.updateProfile(payload);
      currentUser={...currentUser,username:response.profile.username};
      profileEditAlert('success','Profile updated successfully.');
      await renderProfilePage(currentUser);
      setTimeout(closeProfileEditor,500);
    }catch(e){ profileEditAlert('error',e.message||'Unable to update your profile.'); }
  }

  async function loadProfileConnections(kind){
    if(!currentUser){ redirectToLoginFromNav('view your connections'); return; }
    const panel=document.getElementById('profile-connections-panel'),list=document.getElementById('profile-connections-list'); if(!panel||!list)return; panel.classList.remove('hidden'); setText('profile-connections-title',kind==='followers'?'Followers':kind==='following'?'Following':'Blocked users'); list.textContent='Loading…';
    try{ const response=kind==='followers'?await CyberYardHubAPI.users.followers(currentUser.id,{limit:50,offset:0}):kind==='following'?await CyberYardHubAPI.users.following(currentUser.id,{limit:50,offset:0}):await CyberYardHubAPI.users.blocked({limit:50,offset:0}); list.innerHTML=response.users?.length?response.users.map(u=>`<div class="admin-extra-row"><div class="community-post-author"><span class="community-avatar">${escapeHtml((u.username||'?').charAt(0).toUpperCase())}</span><strong>${escapeHtml(u.username)}</strong>${kind==='blocked'?`<button class="btn btn-ghost btn-small" onclick="unblockProfileUser(${escapeHtml(JSON.stringify(u.id))})">Unblock</button>`:''}</div></div>`).join(''):'<div class="admin-extra-row">No users in this list.</div>'; panel.scrollIntoView({behavior:'smooth',block:'start'}); }catch(e){list.textContent=e.message||'Unable to load connections.';}
  }

  async function unblockProfileUser(id){try{await CyberYardHubAPI.users.unblock(id);await loadProfileConnections('blocked');}catch(e){alert(e.message||'Unable to unblock user.');}}

  function closeProfileConnections(){ document.getElementById('profile-connections-panel')?.classList.add('hidden'); }

  async function renderProfilePage(session){
    const initial = (session.username || '?').charAt(0).toUpperCase();
    setText('profile-hero-username', session.username);
    setText('profile-hero-handle', session.username);
    setText('profile-hero-email', session.email);
    setText('profile-hero-avatar-initial', initial);
    try{ const profileResponse=await CyberYardHubAPI.users.meProfile(); const p=profileResponse.profile; setText('profile-bio',p.bio||'No bio added yet.'); setText('profile-hero-username',p.username); setText('profile-hero-handle',p.username); if(p.avatarUrl){ const avatar=document.getElementById('profile-hero-avatar-initial'); if(avatar) avatar.textContent=p.username.charAt(0).toUpperCase(); } renderSocialProgress('profile-category-progress',p.categories||[]); renderSocialProgress('profile-difficulty-progress',p.difficulties||[]); }catch(_){ setText('profile-bio','No bio added yet.'); }

    if(session.createdAt){
      const d = new Date(session.createdAt);
      setText('profile-hero-since', d.toLocaleDateString(undefined, {month:'long', day:'numeric', year:'numeric'}));
    } else {
      setText('profile-hero-since', '—');
    }

    try{
      const stats = await loadUserStats();
      applyUserStats(stats, 'profile');
      const profileResponse = await CyberYardHubAPI.users.meProfile();
      const profile = profileResponse.profile;
      setText('profile-followers-count', profile.followersCount || 0);
      setText('profile-following-count', profile.followingCount || 0);
      setText('profile-bio', profile.bio || 'No bio added yet.');
      renderSocialProgress('profile-category-progress', profile.categories || []);
      renderSocialProgress('profile-difficulty-progress', profile.difficulties || []);
      const publicPosts = document.getElementById('profile-public-posts');
      if(publicPosts) publicPosts.innerHTML = profile.recentPosts?.length ? profile.recentPosts.slice(0,5).map(communityPostHtml).join('') : '<div class="community-empty">No public community posts yet.</div>' ;
      await loadActivityPreview('profile-activity-list');
      await loadProfileBadges();
      await loadGamification('profile', true);
    }catch(e){
      if(isUnauthorizedError(e)){ redirectToLoginFromNav('view your profile'); return; }
      setText('profile-points', '—');
      setText('profile-rank', '—');
      setText('profile-solved', '—');
      setText('profile-streak', '—');
    }
  }

  async function goToProfile(){
    if(!guardViewRoute('profile','view your profile')) return;
    const session = await getSession();
    if(!session){ redirectToLoginFromNav('view your profile'); return; }
    currentNav = 'profile'; updateActiveNav();
    showView('profile');
    window.scrollTo({top:0, behavior:'auto'});
    await renderProfilePage(session);
  }

  /* ---------- account sub-navigation ----------
     One shared switcher for every signed-in view. It replaces the sidebar
     that used to be copy-pasted into each view, so account navigation is
     declared once and can never drift between pages. It is only rendered
     for an authenticated session on an account surface. */
  const ACCOUNT_VIEWS = new Set([
    'dashboard', 'profile', 'badges', 'activity', 'settings', 'challenges',
    'challenge-detail', 'leaderboard', 'teams', 'submit-flag', 'community',
    'events', 'event-detail', 'admin'
  ]);

  function syncAccountSubnav(session){
    const bar = document.getElementById('account-subnav');
    if(!bar) return;
    const show = !!session && ACCOUNT_VIEWS.has(activeViewName);
    bar.hidden = !show;
    if(!session) return;
    setText('account-subnav-username', session.username);
    setText('account-subnav-email', session.email);
    setText('account-subnav-avatar', (session.username || '?').charAt(0).toUpperCase());
  }

  function syncFooterAccountState(session){
    document.querySelectorAll('[data-nav-guest-action]').forEach(el => { el.hidden = !!session; });
    document.querySelectorAll('[data-nav-authed-cta]').forEach(el => { el.hidden = !session; });
  }

  /* ---------- home range read-out (live) ----------
     Everything below the hero is driven by the real API. Guests see a neutral
     read-out (an em dash plus a sign-in hint) rather than invented numbers,
     because every range endpoint is authenticated — showing "48 operators"
     to an anonymous visitor would be a fiction. Signed-in visitors get live
     figures, refreshed on range events and on a slow interval so the landing
     page is never stale when a tab is left open. */
  const HOME_LIVE_KEYS = ['challenges','operators','solved','categories','difficulty','teams'];
  const HOME_LIVE_TILE_CAP = 100;   // GET /api/leaderboard rejects limit > 100
  const HOME_LIVE_TEAM_CAP = 50;    // GET /api/teams/leaderboard rejects limit > 50
  let homeLiveSeq = 0;
  let homeLiveTimer = null;

  function setHomeLiveValue(key, value){
    const cell = document.querySelector(`[data-home-live="${key}"] [data-home-live-value]`);
    if(cell) cell.textContent = value;
  }

  function renderHomeLiveIdle(message){
    HOME_LIVE_KEYS.forEach(key => setHomeLiveValue(key, '—'));
    const note = document.getElementById('home-live-note');
    if(note) note.textContent = message;
    const refresh = document.getElementById('home-live-refresh');
    if(refresh) refresh.disabled = true;
    const card = document.querySelector('.home-live-card');
    if(card) card.dataset.state = 'idle';
    setText('home-pulse-state', 'Waiting for a signed-in range');
    const fill = document.getElementById('home-pulse-fill');
    if(fill) fill.style.width = '0%';
    setText('home-pulse-challenges', '—');
    setText('home-pulse-solved', '—');
    setText('home-pulse-rate', '—');
    const board = document.getElementById('home-pulse-board');
    if(board) board.innerHTML = '<li class="home-pulse-empty">Sign in to read the live standings.</li>';
  }

  function renderHomePulseBoard(entries){
    const board = document.getElementById('home-pulse-board');
    if(!board) return;
    if(!entries.length){
      board.innerHTML = '<li class="home-pulse-empty">No operator has scored yet.</li>';
      return;
    }
    board.innerHTML = entries.slice(0, 5).map(entry => `<li class="home-pulse-row${entry.isCurrentUser ? ' is-you' : ''}">
      <span class="home-pulse-rank">#${escapeHtml(String(entry.rank ?? '—'))}</span>
      <span class="home-pulse-name">${escapeHtml(entry.username || 'operator')}</span>
      <span class="home-pulse-solved">${escapeHtml(String(entry.solved ?? 0))} solved</span>
      <span class="home-pulse-points">${escapeHtml(formatPoints(entry.points || 0))}</span>
    </li>`).join('');
  }

  async function refreshHomeLiveStats(){
    const seq = ++homeLiveSeq;
    const card = document.querySelector('.home-live-card');
    if(!card) return;
    clearInterval(homeLiveTimer);
    homeLiveTimer = null;
    if(!currentUser){ renderHomeLiveIdle('Sign in to read live range numbers.'); return; }
    const refresh = document.getElementById('home-live-refresh');
    if(refresh) refresh.disabled = true;
    card.dataset.state = 'loading';
    const [challengesRes, boardRes, categoriesRes, difficultiesRes, teamsRes] = await Promise.all([
      CyberYardHubAPI.challenges.list({ limit: 1, offset: 0 }).catch(() => null),
      CyberYardHubAPI.leaderboard.list({ limit: HOME_LIVE_TILE_CAP, offset: 0 }).catch(() => null),
      CyberYardHubAPI.categories.list().catch(() => null),
      CyberYardHubAPI.difficulties.list().catch(() => null),
      teams.leaderboard({ limit: HOME_LIVE_TEAM_CAP, offset: 0 }).catch(() => null)
    ]);
    if(seq !== homeLiveSeq) return;
    if(refresh) refresh.disabled = false;
    card.dataset.state = 'live';

    const total = Number(challengesRes?.total || 0);
    const solved = Number(challengesRes?.solvedTotal || 0);
    const board = Array.isArray(boardRes?.leaderboard) ? boardRes.leaderboard : [];
    const teamRows = Array.isArray(teamsRes?.leaderboard) ? teamsRes.leaderboard : [];

    setHomeLiveValue('challenges', formatPoints(total));
    setHomeLiveValue('operators', board.length >= HOME_LIVE_TILE_CAP ? `${HOME_LIVE_TILE_CAP}+` : formatPoints(board.length));
    setHomeLiveValue('solved', formatPoints(solved));
    setHomeLiveValue('categories', categoriesRes?.categories?.length ? formatPoints(categoriesRes.categories.length) : '—');
    setHomeLiveValue('difficulty', difficultiesRes?.difficulties?.length ? formatPoints(difficultiesRes.difficulties.length) : '—');
    setHomeLiveValue('teams', teamsRes ? (teamRows.length >= HOME_LIVE_TEAM_CAP ? `${HOME_LIVE_TEAM_CAP}+` : formatPoints(teamRows.length)) : '—');

    const note = document.getElementById('home-live-note');
    if(note) note.textContent = `Live from the range · updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    const rate = total ? Math.round((solved / total) * 100) : 0;
    setText('home-pulse-state', total ? `${rate}% of the range captured` : 'Range is being prepared');
    setText('home-pulse-challenges', formatPoints(total));
    setText('home-pulse-solved', formatPoints(solved));
    setText('home-pulse-rate', total ? `${rate}%` : '—');
    const fill = document.getElementById('home-pulse-fill');
    if(fill) fill.style.width = `${Math.max(0, Math.min(100, rate))}%`;
    renderHomePulseBoard(board.map(entry => ({ ...entry, isCurrentUser: entry.id === currentUser?.id })));

    clearInterval(homeLiveTimer);
    homeLiveTimer = setInterval(() => { if(activeViewName === 'landing') void refreshHomeLiveStats(); }, 60000);
  }

  function activityIcon(type){
    if(type==='FIRST_BLOOD') return '<path d="M12 22c4 0 7-2.7 7-6.8 0-3.1-1.8-5.7-4.2-8.3.1 2.4-1 3.9-2.3 4.9.1-4.4-1.8-7-4.5-9.8.2 4.1-2.8 6.3-2.8 10.4C5.2 18.7 8.1 22 12 22z"/>';
    if(type==='BADGE_EARNED') return '<path d="M12 2l2.6 6.6L21 10l-5 4.4L17.4 21 12 17.3 6.6 21 8 14.4 3 10l6.4-1.4z"/>';
    if(type.startsWith('COMMUNITY_')) return '<path d="M4 5h16v11H8l-4 4z"/>';
    if(type.includes('PASSWORD') || type==='EMAIL_VERIFIED' || type==='SESSION_REVOKED') return '<path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 7v5l3 2"/>';
    return '<path d="M20 6L9 17l-5-5"/>';
  }

  function activityHtmlFromRecords(records){
    if(!records.length) return '<div class="notification-state"><div class="notification-state-icon">◌</div><strong>No activity yet.</strong><span>Your meaningful account activity will appear here.</span></div>';
    return records.map(item=>{
      const metadata=item.metadata&&typeof item.metadata==='object'?item.metadata:{};
      const points=typeof metadata.points==='number'?`+${formatPoints(metadata.points)}`:'';
      return `<div class="activity-item activity-record"><div class="activity-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">${activityIcon(item.type)}</svg></div><div class="activity-body"><div class="a-title">${escapeHtml(item.description)}</div><div class="a-meta">${escapeHtml(relativeTime(item.createdAt))} · ${escapeHtml(item.type.replaceAll('_',' '))}</div></div><div class="activity-pts">${points}</div></div>`;
    }).join('');
  }

  async function loadActivityPreview(targetId){
    const root=document.getElementById(targetId); if(!root) return;
    try{ const response=await CyberYardHubAPI.activity.list({limit:5,offset:0}); root.innerHTML=activityHtmlFromRecords((response.activities||[]).slice(0,5)); }
    catch(_){ root.innerHTML='<div class="notification-state error">Unable to load recent activity.</div>'; }
  }

  function renderActivityPagination(total,limit,offset){
    const el=document.getElementById('activity-pagination'); if(!el) return;
    const page=Math.floor(offset/limit)+1; const pages=Math.max(1,Math.ceil(total/limit));
    el.innerHTML=`<button type="button" class="btn btn-ghost btn-small" ${offset<=0?'disabled':''} onclick="activityPreviousPage()">Previous</button><span class="challenge-page-label">Page ${page} / ${pages}</span><button type="button" class="btn btn-ghost btn-small" ${offset+limit>=total?'disabled':''} onclick="activityNextPage()">Next</button>`;
  }

  async function loadActivityPage(){
    const root=document.getElementById('activity-list'); if(!root) return;
    const seq=++activitySeq;
    root.innerHTML='<div class="notification-state">Loading activity…</div>';
    try{
      const response=await CyberYardHubAPI.activity.list({limit:activityPageSize,offset:activityOffset});
      if(seq!==activitySeq) return;
      root.innerHTML=activityHtmlFromRecords(response.activities||[]); renderActivityPagination(response.total||0,response.limit||activityPageSize,response.offset||0);
    }catch(e){
      if(isUnauthorizedError(e)){ redirectToLoginFromNav('view your activity'); return; }
      root.innerHTML='<div class="notification-state error">Unable to load activity right now.</div>';
    }
  }
  function activityPreviousPage(){ activityOffset=Math.max(0,activityOffset-activityPageSize); void loadActivityPage(); }
  function activityNextPage(){ activityOffset+=activityPageSize; void loadActivityPage(); }

  async function goToActivity(){
    if(!guardViewRoute('activity','view your activity')) return;
    const session=await getSession();
    if(!session){ redirectToLoginFromNav('view your activity'); return; }
    currentNav='activity'; updateActiveNav();
    showView('activity'); window.scrollTo({top:0,behavior:'auto'});
    syncAccountSubnav(session);
    activityOffset=0; await loadActivityPage();
  }

  /* ---------- Modification 6: CTF / events ---------- */
  let eventOffset = 0;
  const eventPageSize = 12;
  let currentEventId = null;
  let eventRequestSeq = 0;

  function eventStatusLabel(status){ return ({UPCOMING:'Upcoming',LIVE:'Live',ENDED:'Ended',DRAFT:'Draft',ARCHIVED:'Archived'})[status] || status || '—'; }
  function eventDate(value){ try{return new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});}catch(_){return '—';} }
  function eventDateInput(value){ if(!value)return ''; const d=new Date(value); if(Number.isNaN(d.getTime()))return ''; const pad=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  function eventInputDate(id){ const v=document.getElementById(id)?.value; return v ? new Date(v).toISOString() : null; }
  function renderEventCard(event){
    const reg=event.registered;
    const capacity=event.maxParticipants ? `${event.participantCount}/${event.maxParticipants}` : `${event.participantCount}`;
    return `<button type="button" class="event-card" onclick="goToEventDetail(${escapeHtml(JSON.stringify(event.id))})"><div class="event-card-top"><span class="event-status-pill ${String(event.status||'').toLowerCase().replace(/[^a-z0-9_-]/g,'')}">${escapeHtml(eventStatusLabel(event.status))}</span><span class="event-participants">${escapeHtml(capacity)} participants</span></div><h3>${escapeHtml(event.name)}</h3><p>${escapeHtml(event.shortDescription || event.description || '')}</p><div class="event-card-meta"><span>${escapeHtml(eventDate(event.startAt))}</span><span>${escapeHtml(event.challengeCount)} challenges</span><span>${reg?'Registered':'Registration'}</span></div></button>`;
  }
  function renderEventPagination(total,limit,offset){ const el=document.getElementById('events-pagination'); if(!el)return; const pages=Math.max(1,Math.ceil(total/limit)),page=Math.floor(offset/limit)+1; el.innerHTML=pages<=1?'':`<button class="btn btn-ghost btn-small" ${offset<=0?'disabled':''} onclick="eventOffset=Math.max(0,eventOffset-${limit});loadEvents()">Previous</button><span class="challenge-page-label">Page ${page} / ${pages}</span><button class="btn btn-ghost btn-small" ${offset+limit>=total?'disabled':''} onclick="eventOffset=eventOffset+${limit};loadEvents()">Next</button>`; }
  function resetEventsPage(){eventOffset=0;}
  async function loadEvents(){
    const root=document.getElementById('events-list'); if(!root)return; root.innerHTML='<div class="challenge-extra-empty">Loading events…</div>'; const seq=++eventRequestSeq;
    try{ const response=await CyberYardHubAPI.events.list({search:document.getElementById('events-search')?.value.trim()||undefined,status:document.getElementById('events-status')?.value||undefined,sort:document.getElementById('events-sort')?.value||'start_asc',limit:eventPageSize,offset:eventOffset}); if(seq!==eventRequestSeq)return; root.innerHTML=response.events?.length?response.events.map(renderEventCard).join(''):'<div class="challenge-extra-empty">No events match these filters.</div>'; renderEventPagination(Number(response.total||0),Number(response.limit||eventPageSize),Number(response.offset||0)); }
    catch(e){ if(e.status===401){redirectToLoginFromNav('view CTF events');return;} root.innerHTML=`<div class="challenge-extra-empty">${escapeHtml(e.message||'Unable to load events right now.')}</div>`; }
  }
  function renderEventProgress(progress){ const root=document.getElementById('event-progress'); if(!root)return; if(!progress||!progress.registered){root.innerHTML='<div class="event-progress-note">Register for this event to see your event-specific score and progress.</div>';return;} root.innerHTML=`<div><span>POINTS</span><strong>${formatPoints(progress.points)}</strong></div><div><span>SOLVED</span><strong>${progress.solved}/${progress.totalChallenges}</strong></div><div><span>FIRST BLOOD</span><strong>${progress.firstBloods}</strong></div><div><span>COMPLETION</span><strong>${progress.completionRate}%</strong></div>`; }
  function renderEventChallenges(challenges){ const root=document.getElementById('event-challenges-list'); if(!root)return; root.innerHTML=challenges?.length?challenges.map(c=>`<article class="event-challenge-row"><div class="event-challenge-number">${c.position}</div><div class="event-challenge-main"><div class="event-challenge-top"><span class="p-tag accent">${escapeHtml(c.category?.name||'Challenge')}</span><span class="difficulty-badge ${escapeHtml((c.difficulty?.name||'').toLowerCase())}">${escapeHtml(c.difficulty?.name||'')}</span></div><h4>${escapeHtml(c.title)}</h4><p>${escapeHtml(c.teaser||'')}</p><div class="event-challenge-meta"><span>${formatPoints(c.points)} pts</span>${c.solved?'<span class="cc-solved-badge">✓ Solved</span>':''}</div></div><div><button type="button" class="btn btn-ghost btn-small" onclick="goToChallengeDetail(${escapeHtml(JSON.stringify(c.id))})">Open challenge</button></div></article>`).join(''):'<div class="challenge-extra-empty">No event challenges are currently available.</div>'; }
  function renderEventAnnouncements(items){ const root=document.getElementById('event-announcements-list'); if(!root)return; root.innerHTML=items?.length?items.map(a=>`<article class="event-announcement"><div class="event-announcement-head"><strong>${escapeHtml(a.title)}</strong><time>${escapeHtml(eventDate(a.createdAt))}</time></div><div>${escapeHtml(a.content)}</div></article>`).join(''):'<div class="challenge-extra-empty">No announcements yet.</div>'; }
  function renderEventLeaderboard(entries){ const root=document.getElementById('event-leaderboard-list'); if(!root)return; root.innerHTML=entries?.length?`<div class="event-lb-table" tabindex="0" role="region" aria-label="Event leaderboard standings"><div class="event-lb-row event-lb-head"><span>Rank</span><span>User</span><span>Points</span><span>Solves</span><span>First Blood</span></div>${entries.map(r=>`<div class="event-lb-row ${r.isCurrentUser?'current':''}"><span>#${r.rank}</span><span>${escapeHtml(r.username)}</span><span>${formatPoints(r.points)}</span><span>${r.solves}</span><span>${r.firstBloods}</span></div>`).join('')}</div>`:'<div class="challenge-extra-empty">No registered participants have scored yet.</div>'; }
  async function goToEvents(){ if(!guardViewRoute('events','view CTF events')) return; const session=await getSession(); if(!session){redirectToLoginFromNav('view CTF events');return;} currentNav='events';updateActiveNav();showView('events');window.scrollTo({top:0,behavior:'auto'});resetEventsPage();await loadEvents(); }
  async function goToEventDetail(id){ if(!guardViewRoute('event-detail','view this event')) return; const session=await getSession(); if(!session){redirectToLoginFromNav('view this event');return;} currentEventId=id; currentNav='events';updateActiveNav();setText('event-detail-name','Loading…');setText('event-detail-short','Loading event details…');setText('event-detail-description','Loading…');setText('event-detail-status','—');setText('event-detail-access','—');document.getElementById('event-register-btn')?.classList.add('hidden');showView('event-detail');window.scrollTo({top:0,behavior:'auto'});try{const response=await CyberYardHubAPI.events.get(id);if(currentEventId!==id)return;const e=response.event;setText('event-detail-name',e.name);setText('event-detail-short',e.shortDescription||'CTF event');setText('event-detail-description',e.description||'');setText('event-detail-status',eventStatusLabel(e.status));const statusEl=document.getElementById('event-detail-status');if(statusEl){statusEl.className='event-status-pill '+String(e.status||'').toLowerCase().replace(/[^a-z0-9_-]/g,'');}document.getElementById('event-detail-meta').innerHTML=`<div><span>START</span><strong>${escapeHtml(eventDate(e.startAt))}</strong></div><div><span>END</span><strong>${escapeHtml(eventDate(e.endAt))}</strong></div><div><span>PARTICIPANTS</span><strong>${escapeHtml(e.maxParticipants?`${e.participantCount}/${e.maxParticipants}`:String(e.participantCount))}</strong></div><div><span>CHALLENGES</span><strong>${e.challengeCount}</strong></div>`;setText('event-detail-access',response.accessRestricted?'Registration required':'Participant access');const btn=document.getElementById('event-register-btn');if(btn){const locked=!!response.event.registrationLocked;const open=!!response.event.registrationOpen;btn.classList.toggle('hidden',(!response.registered&&!open)||e.status==='ENDED'||e.status==='ARCHIVED');btn.disabled=locked;btn.textContent=response.registered?(locked?'Registered':'Unregister'):'Register';btn.classList.toggle('btn-danger',!!response.registered&&!locked);btn.classList.toggle('btn-primary',!response.registered);}renderEventProgress(response.progress);renderEventChallenges(response.challenges||[]);renderEventAnnouncements(response.announcements||[]);renderEventLeaderboard(response.leaderboard||[]);}catch(e){document.getElementById('event-challenges-list').innerHTML=`<div class="challenge-extra-empty">${escapeHtml(e.message||'Unable to load this event.')}</div>`;} }
  async function toggleEventRegistration(){ if(!currentEventId)return; const btn=document.getElementById('event-register-btn'); const unregister=btn?.textContent==='Unregister'; try{ if(unregister)await CyberYardHubAPI.events.unregister(currentEventId); else await CyberYardHubAPI.events.register(currentEventId); await goToEventDetail(currentEventId); }catch(e){alert(e.message||'Unable to update event registration.');} }

  /* ---------- Phase 8: badges / community ---------- */
  function badgeIconSvg(icon){
    const map = {
      star: '<path d="M12 2l2.6 6.6L21 10l-5 4.4L17.4 21 12 17.3 6.6 21 8 14.4 3 10l6.4-1.4z"/>',
      check: '<path d="M20 6L9 17l-5-5"/>',
      bolt: '<path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/>',
      flame: '<path d="M12 22c4 0 7-2.7 7-6.8 0-3.1-1.8-5.7-4.2-8.3.1 2.4-1 3.9-2.3 4.9.1-4.4-1.8-7-4.5-9.8.2 4.1-2.8 6.3-2.8 10.4C5.2 18.7 8.1 22 12 22z"/>'
    };
    return map[icon] || map.star;
  }

  function badgeCard(badge){
    return `<button type="button" class="achv ${badge.awarded ? 'earned' : 'locked'} phase8-badge-card" title="${escapeHtml(badge.description)}" onclick="showBadgeDetail(${escapeHtml(JSON.stringify(badge.id))})">
      <div class="a-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">${badgeIconSvg(badge.icon)}</svg></div>
      <div class="a-label">${escapeHtml(badge.name)}</div>
      <div class="phase8-badge-desc">${escapeHtml(badge.description)}</div>
    </button>`;
  }

  async function showBadgeDetail(id){
    try{
      const response=await CyberYardHubAPI.badges.get(id); const b=response.badge;
      setText('badge-detail-name', b.name); setText('badge-detail-description', b.description); setText('badge-detail-status', b.awarded ? 'Earned' : 'Not yet earned');
      setText('badge-detail-icon', (b.icon || 'star').toUpperCase());
      const panel=document.getElementById('badge-detail-panel'); if(panel) panel.classList.remove('hidden');
    }catch(e){ alert(e.message || 'Unable to load badge details.'); }
  }

  async function loadBadgesInto(gridId, countId){
    const grid = document.getElementById(gridId);
    if(!grid) return [];
    try{
      const response = await CyberYardHubAPI.badges.list();
      const badges = response.badges || [];
      grid.innerHTML = badges.length ? badges.map(badgeCard).join('') : '<div class="challenge-extra-empty">No badges are enabled yet.</div>';
      const awarded = badges.filter(b => b.awarded).length;
      if(countId) setText(countId, `${awarded} / ${badges.length}`);
      return badges;
    }catch(e){
      grid.innerHTML = '<div class="challenge-extra-empty">Unable to load badges right now.</div>';
      if(countId) setText(countId, '—');
      return [];
    }
  }

  async function goToBadges(){
    if(!guardViewRoute('badges','view your badges')) return;
    const session = await getSession();
    if(!session){ redirectToLoginFromNav('view your badges'); return; }
    currentNav = 'badges'; updateActiveNav();
showView('badges');
    window.scrollTo({top:0, behavior:'auto'});
    await loadBadgesInto('badges-grid');
  }

  async function loadProfileBadges(){
    await Promise.all([
      loadBadgesInto('dash-badges-list', 'dash-badges-count'),
      loadBadgesInto('profile-badges-list', 'profile-badges-count')
    ]);
  }

  let communityEditingPostId = null;
  let communityOffset = 0;
  const communityPageSize = 10;
  function resetCommunityPage(){ communityOffset=0; }
  function communityCategoryLabel(value){ const labels={GENERAL:'General',CTF:'CTF',WEB_SECURITY:'Web Security',NETWORK_SECURITY:'Network Security',CRYPTOGRAPHY:'Cryptography',FORENSICS:'Forensics',REVERSE_ENGINEERING:'Reverse Engineering',OSINT:'OSINT',LEARNING:'Learning',ANNOUNCEMENTS:'Announcements'}; return labels[value]||value||'General'; }
  function renderSocialProgress(id, rows){ const el=document.getElementById(id); if(!el) return; el.innerHTML=rows.length ? rows.map(r=>`<div class="social-progress-row"><div class="sr-top"><span class="srn">${escapeHtml(r.name)}</span><span class="srp">${r.solved}/${r.available} · ${r.percentage}%</span></div><div class="skill-track"><div class="skill-fill" style="width:${Math.max(0,Math.min(100,Number(r.percentage)||0))}%"></div></div></div>`).join('') : '<div class="community-empty">No published challenges in this group yet.</div>'; }
  async function goToCommunity(){
    if(!guardViewRoute('community','join the community')) return;
    const session=await getSession(); if(!session){ redirectToLoginFromNav('join the community'); return; }
    currentNav='community'; updateActiveNav();showView('community'); window.scrollTo({top:0,behavior:'auto'}); await loadCommunityPosts();
  }
  function communityCommentHtml(post, comment){ const author=comment&&comment.author?comment.author:{id:null,username:'deleted'}; const mine=!!currentUser&&author.id!=null&&author.id===currentUser.id; return `<div class="community-comment"><div><strong>${escapeHtml(author.username)}</strong><span class="community-meta">${new Date(comment.createdAt).toLocaleString()}</span></div><div class="community-comment-content">${escapeHtml(comment.content)}</div><div class="community-actions">${mine?`<button class="btn btn-ghost btn-small" onclick="editCommunityComment(${escapeHtml(JSON.stringify(post.id))},${escapeHtml(JSON.stringify(comment.id))})">Edit</button><button class="btn btn-danger btn-small" onclick="deleteCommunityComment(${escapeHtml(JSON.stringify(post.id))},${escapeHtml(JSON.stringify(comment.id))})">Delete</button>`:''}<button class="btn btn-ghost btn-small" onclick="reportCommunityComment(${escapeHtml(JSON.stringify(post.id))},${escapeHtml(JSON.stringify(comment.id))})">Report</button></div></div>`; }
  function communityPostHtml(post){ const author=post&&post.author?post.author:{id:null,username:'deleted'}; const mine=!!currentUser&&author.id!=null&&author.id===currentUser.id; return `<article class="community-post panel-block"><div class="community-post-head"><div><div class="community-post-author"><span class="community-avatar">${escapeHtml((author.username||'?').charAt(0).toUpperCase())}</span><span><strong>${escapeHtml(author.username)}</strong><span class="community-meta">${new Date(post.createdAt).toLocaleString()}</span></span></div><h3>${escapeHtml(post.title)}</h3><span class="p-tag accent">${escapeHtml(communityCategoryLabel(post.category))}</span></div>${mine?`<div class="community-actions"><button class="btn btn-ghost btn-small" onclick="editCommunityPost(${escapeHtml(JSON.stringify(post.id))})">Edit</button><button class="btn btn-danger btn-small" onclick="deleteCommunityPost(${escapeHtml(JSON.stringify(post.id))})">Delete</button></div>`:''}</div><div class="community-post-content">${escapeHtml(post.content)}</div><div class="community-social-actions"><button class="btn btn-ghost btn-small" onclick="toggleCommunityLike(${escapeHtml(JSON.stringify(post.id))},${post.viewerReacted?'true':'false'})">${post.viewerReacted?'♥ Liked':'♡ Like'} · ${post.reactionCount}</button><button class="btn btn-ghost btn-small" onclick="loadCommunityComments(${escapeHtml(JSON.stringify(post.id))})">Replies · ${post.commentCount}</button><button class="btn btn-ghost btn-small" onclick="reportCommunityPost(${escapeHtml(JSON.stringify(post.id))})">Report</button></div><div id="community-comments-${escapeHtml(post.id)}" class="community-comments"></div></article>`; }
  async function loadCommunityPosts(){
    const el=document.getElementById('community-posts'); if(!el) return;
    const seq=++communitySeq;
    el.innerHTML='<div class="challenge-extra-empty">Loading community posts…</div>';
    const category=document.getElementById('community-category-filter')?.value||undefined, search=document.getElementById('community-search')?.value.trim()||undefined, sort=document.getElementById('community-sort')?.value||'newest';
    try{ const response=await CyberYardHubAPI.community.feed({limit:communityPageSize,offset:communityOffset,category,search,sort}); if(seq!==communitySeq) return; el.innerHTML=response.posts?.length?response.posts.map(communityPostHtml).join(''):'<div class="challenge-extra-empty">No community posts match these filters.</div>'; renderCommunityPagination(response.total||0,response.limit||communityPageSize,response.offset||0); }catch(e){ if(seq!==communitySeq) return; el.innerHTML=`<div class="challenge-extra-empty">${escapeHtml(e.message||'Unable to load community posts right now.')}</div>`; }
  }
  function renderCommunityPagination(total,limit,offset){ const el=document.getElementById('community-pagination'); if(!el)return; const page=Math.floor(offset/limit)+1,pages=Math.max(1,Math.ceil(total/limit)); el.innerHTML=pages<=1?'':`<button class="btn btn-ghost btn-small" ${offset<=0?'disabled':''} onclick="communityOffset=Math.max(0,communityOffset-${limit});loadCommunityPosts()">Previous</button><span class="challenge-page-label">Page ${page} / ${pages}</span><button class="btn btn-ghost btn-small" ${offset+limit>=total?'disabled':''} onclick="communityOffset=communityOffset+${limit};loadCommunityPosts()">Next</button>`; }
  function openCommunityComposer(post){ const panel=document.getElementById('community-composer'); if(!panel)return; communityEditingPostId=post?.id||null; setText('community-form-title',communityEditingPostId?'Edit post':'New post'); document.getElementById('community-post-title').value=post?.title||''; document.getElementById('community-post-content').value=post?.content||''; document.getElementById('community-post-category').value=post?.category||'GENERAL'; panel.classList.remove('hidden'); panel.scrollIntoView({behavior:'smooth',block:'start'}); }
  function closeCommunityComposer(){ communityEditingPostId=null; document.getElementById('community-composer')?.classList.add('hidden'); }
  async function submitCommunityPost(evt){ evt.preventDefault(); const title=document.getElementById('community-post-title').value.trim(),content=document.getElementById('community-post-content').value.trim(),category=document.getElementById('community-post-category').value; try{ if(communityEditingPostId) await CyberYardHubAPI.community.posts.update(communityEditingPostId,{title,content,category}); else await CyberYardHubAPI.community.posts.create({title,content,category}); closeCommunityComposer(); resetCommunityPage(); await loadCommunityPosts(); }catch(e){ alert(e.message||'Unable to save the post.'); } }
  async function editCommunityPost(id){ try{ const response=await CyberYardHubAPI.community.posts.get(id); openCommunityComposer(response.post); }catch(e){alert(e.message||'Unable to load the post.');} }
  async function deleteCommunityPost(id){ if(!confirm('Delete this post and its replies?'))return; try{await CyberYardHubAPI.community.posts.remove(id);await loadCommunityPosts();}catch(e){alert(e.message||'Unable to delete the post.');} }
  async function loadCommunityComments(postId){ const root=document.getElementById('community-comments-'+escapeHtml(postId)); if(!root)return; root.innerHTML='<div class="community-empty">Loading replies…</div>'; try{ const response=await CyberYardHubAPI.community.comments.list(postId,{limit:30,offset:0}); root.innerHTML=`<div class="panel-kicker">REPLIES</div>${response.comments?.length?response.comments.map(c=>communityCommentHtml({id:postId},c)).join(''):'<div class="community-empty">No replies yet.</div>'}<form class="community-reply-form" onsubmit="submitCommunityComment(event,${escapeHtml(JSON.stringify(postId))})"><input maxlength="5000" placeholder="Write a reply…" required><button class="btn btn-ghost btn-small" type="submit">Reply</button></form>`; }catch(e){root.innerHTML=`<div class="community-empty">${escapeHtml(e.message||'Unable to load replies.')}</div>`;} }
  async function submitCommunityComment(evt,postId){evt.preventDefault();const input=evt.target.querySelector('input'),content=input.value.trim();try{await CyberYardHubAPI.community.comments.create(postId,{content});input.value='';await loadCommunityComments(postId);}catch(e){alert(e.message||'Unable to add the reply.');}}
  async function editCommunityComment(postId,commentId){const value=prompt('Edit reply:');if(value===null)return;const content=value.trim();if(!content)return;try{await CyberYardHubAPI.community.comments.update(postId,commentId,{content});await loadCommunityComments(postId);}catch(e){alert(e.message||'Unable to edit the reply.');}}
  async function deleteCommunityComment(postId,commentId){if(!confirm('Delete this reply?'))return;try{await CyberYardHubAPI.community.comments.remove(postId,commentId);await loadCommunityComments(postId);}catch(e){alert(e.message||'Unable to delete the reply.');}}
  async function toggleCommunityLike(id,liked){try{if(liked)await CyberYardHubAPI.community.posts.unlike(id);else await CyberYardHubAPI.community.posts.like(id);await loadCommunityPosts();}catch(e){alert(e.message||'Unable to update reaction.');}}
  function openCommunityReport(target){ const modal=document.getElementById('community-report-modal'); if(!modal)return; document.getElementById('community-report-post-id').value=target.postId||''; document.getElementById('community-report-comment-id').value=target.commentId||''; document.getElementById('community-report-reason').value='SPAM'; document.getElementById('community-report-description').value=''; modal.classList.remove('hidden'); modal.scrollIntoView({behavior:'smooth',block:'center'}); }
  function closeCommunityReport(){ document.getElementById('community-report-modal')?.classList.add('hidden'); }
  function reportCommunityComment(postId,commentId){ openCommunityReport({postId,commentId}); }
  function reportCommunityPost(id){ openCommunityReport({postId:id}); }
  async function submitCommunityReport(evt){ evt.preventDefault(); const postId=document.getElementById('community-report-post-id').value||undefined,commentId=document.getElementById('community-report-comment-id').value||undefined,reason=document.getElementById('community-report-reason').value,description=document.getElementById('community-report-description').value.trim()||undefined; try{ await CyberYardHubAPI.community.reports.create({postId,commentId,reason,description}); closeCommunityReport(); alert('Report submitted.'); }catch(e){ alert(e.message||'Unable to submit the report.'); } }

  async function toggleSelectedFollow(){ if(!selectedLeaderboardUserId||!selectedLeaderboardProfile)return; try{ if(selectedLeaderboardProfile.isFollowing) await CyberYardHubAPI.users.unfollow(selectedLeaderboardUserId); else await CyberYardHubAPI.users.follow(selectedLeaderboardUserId); const p=(await CyberYardHubAPI.users.profile(selectedLeaderboardUserId)).profile; selectedLeaderboardProfile=p; document.getElementById('lb-follow-btn').textContent=p.isFollowing?'Unfollow':'Follow'; }catch(e){alert(e.message||'Unable to update follow.');} }
  async function toggleSelectedBlock(){ if(!selectedLeaderboardUserId||!selectedLeaderboardProfile)return; const blocking=!selectedLeaderboardProfile.isBlocked; if(blocking&&!confirm('Block this user? This removes the mutual follow relationship and prevents social interactions.'))return; try{ if(blocking) await CyberYardHubAPI.users.block(selectedLeaderboardUserId); else await CyberYardHubAPI.users.unblock(selectedLeaderboardUserId); const p=(await CyberYardHubAPI.users.profile(selectedLeaderboardUserId)).profile; selectedLeaderboardProfile=p; document.getElementById('lb-block-btn').textContent=p.isBlocked?'Unblock':'Block'; document.getElementById('lb-follow-btn').textContent=p.isFollowing?'Unfollow':'Follow'; if(blocking) await goToLeaderboard(); }catch(e){alert(e.message||'Unable to update block.');} }

  /* ---------- leaderboard ---------- */
  let currentLeaderboard = [];
  let selectedLeaderboardUserId = null;
  let selectedLeaderboardProfile = null;

  function renderPodium(entries){
    const podium = entries.slice(0, 3);
    if(podium.length < 3){
      document.getElementById('lb-podium').innerHTML = '<div class="board-empty">The top three appear once three operators have scored.</div>';
      return;
    }
    const [p1, p2, p3] = podium;
    const card = (p) => `
      <div class="lb-podium-card rank-${escapeHtml(String(p.rank ?? '').replace(/[^0-9]/g,''))}">
        <div class="rank-badge">${p.rank}</div>
        <div class="lb-avatar"><div class="lb-avatar-inner">${escapeHtml(p.username.charAt(0).toUpperCase())}</div></div>
        <div class="lb-name">${escapeHtml(p.username)}</div>
        <div class="lb-pts">${formatPoints(p.points)}</div>
        <div class="lb-solved">${p.solved} solved</div>
      </div>`;
    document.getElementById('lb-podium').innerHTML = card(p2) + card(p1) + card(p3);
  }

  function renderLeaderboardTable(entries){
    const rows = entries.slice(3);
    const rowHtml = (p) => `
      <div class="lb-row" role="button" tabindex="0" data-user-id="${escapeHtml(p.id)}" onclick="selectLeaderboardUser(${escapeHtml(JSON.stringify(p.id))})" onkeydown="if(event.key==='Enter' || event.key===' ') { event.preventDefault(); selectLeaderboardUser(${escapeHtml(JSON.stringify(p.id))}); }">
        <span class="lb-rank">${p.rank}</span>
        <div class="lb-player">
          <div class="lb-avatar-sm">${escapeHtml(p.username.charAt(0).toUpperCase())}</div>
          <span class="lb-player-name">${escapeHtml(p.username)}</span>
        </div>
        <span class="lb-pts-cell">${formatPoints(p.points)}</span>
        <span class="lb-solved-cell">${p.solved}</span>
        <span class="lb-xp-cell">${formatPoints(p.xp)}</span>
        <span class="lb-level-cell">${p.level}</span>
        <span class="lb-firstblood-cell">${p.firstBloods}</span>
        <span class="lb-streak-cell">${p.currentStreak}d</span>
      </div>`;
    document.getElementById('lb-table-body').innerHTML = rows.map(rowHtml).join('');
  }

  async function selectLeaderboardUser(userId){
    try{
      const response = await CyberYardHubAPI.users.stats(userId);
      const stats = response.stats;
      const profileResponse = await CyberYardHubAPI.users.profile(userId);
      selectedLeaderboardUserId = userId; selectedLeaderboardProfile = profileResponse.profile;
      const followBtn=document.getElementById('lb-follow-btn'); if(followBtn){ followBtn.textContent=selectedLeaderboardProfile.isFollowing?'Unfollow':'Follow'; followBtn.disabled=(currentUser&&userId===currentUser.id); }
      const blockBtn=document.getElementById('lb-block-btn'); if(blockBtn){ blockBtn.textContent=selectedLeaderboardProfile.isBlocked?'Unblock':'Block'; blockBtn.disabled=(currentUser&&userId===currentUser.id); }
      setText('lb-selected-bio', selectedLeaderboardProfile.bio || 'No bio added.'); setText('lb-selected-followers', String(selectedLeaderboardProfile.followersCount || 0)); setText('lb-selected-following', String(selectedLeaderboardProfile.followingCount || 0));
      const initial = (stats.username || '?').charAt(0).toUpperCase();
      setText('lb-selected-avatar', initial);
      setText('lb-selected-username', stats.username);
      setText('lb-selected-rank', `#${stats.rank}`);
      setText('lb-selected-points', formatPoints(stats.points));
      setText('lb-selected-solved', String(stats.solved));
      setText('lb-selected-xp', formatPoints(stats.xp || 0));
      setText('lb-selected-level', String(stats.level || 1));
      setText('lb-selected-first-bloods', String(stats.firstBloods || 0));
      setText('lb-selected-streak', String(stats.currentStreak || 0));

      const recent = document.getElementById('lb-selected-recent');
      if(recent){
        recent.innerHTML = (stats.recentSolves || []).slice(0, 5).map(solve => `
          <div class="lb-selected-solve">
            <span>${escapeHtml(solve.title)}</span>
            <span>${formatPoints(solve.points)} pts</span>
          </div>`).join('') || '<div class="lb-selected-empty">No solves yet.</div>';
      }
      document.getElementById('lb-selected-user').classList.remove('hidden');
    }catch(e){
      /* Keep the selected-user panel unchanged on failure; never expose error details. */
    }
  }

  window.selectLeaderboardUser = selectLeaderboardUser;

  /* ---------- protected scoreboard route ---------- */
  let scoreboardMode = 'solo';
  let teamScoreboardRequestSeq = 0;
  let teamScoreboardUnavailable = false;

  function renderScoreboardMode(mode){
    scoreboardMode = mode === 'team' ? 'team' : 'solo';
    const solo = document.getElementById('lb-solo-content');
    const teamPanel = document.getElementById('team-scoreboard-panel');
    const toggle = document.getElementById('scoreboard-mode-toggle');
    if(solo) solo.hidden = scoreboardMode === 'team';
    if(teamPanel) teamPanel.classList.toggle('hidden', scoreboardMode !== 'team');
    if(toggle){
      toggle.hidden = teamScoreboardUnavailable;
      toggle.querySelectorAll('[data-scoreboard-mode]').forEach(button => {
        const active = button.dataset.scoreboardMode === scoreboardMode;
        button.classList.toggle('btn-primary', active);
        button.classList.toggle('btn-ghost', !active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }
  }
  async function setScoreboardMode(mode){
    if(mode !== 'team'){ teamScoreboardRequestSeq++; renderScoreboardMode('solo'); return; }
    if(teamScoreboardUnavailable){ renderScoreboardMode('solo'); return; }
    const list = document.getElementById('team-scoreboard-list');
    const seq = ++teamScoreboardRequestSeq;
    if(list) list.innerHTML = '<div class="board-empty">Loading team standings…</div>';
    try{
      const response = await teams.leaderboard({limit:50, offset:0});
      if(seq !== teamScoreboardRequestSeq) return;
      const rows = Array.isArray(response?.leaderboard) ? response.leaderboard : [];
      if(list) list.innerHTML = rows.length ? `<div class="team-rank-table" role="table" aria-label="Team scoreboard"><div class="team-rank-row team-rank-head" role="row"><span>Rank</span><span>Team</span><span>Members</span><span>Score</span></div>${rows.map(row => `<div class="team-rank-row" role="row"><span>#${escapeHtml(String(row.rank ?? '—'))}</span><strong>${escapeHtml(row.name || 'Unnamed team')}</strong><span>${escapeHtml(String(row.memberCount ?? 0))}</span><span>${escapeHtml(formatPoints(row.score || 0))} pts</span></div>`).join('')}</div>` : '<div class="board-empty">No teams have scored yet.</div>';
      renderScoreboardMode('team');
    }catch(error){
      if(seq !== teamScoreboardRequestSeq) return;
      if(error?.status === 401){ currentUser = null; redirectToLoginFromNav('view the scoreboard'); return; }
      teamScoreboardUnavailable = true;
      console.warn('CyberYardHub team scoreboard unavailable; hiding Team tab.', error);
      renderScoreboardMode('solo');
      if(list) list.innerHTML = '<div class="board-empty">Team standings are not available in this deployment.</div>';
      window.cyhNotify?.('Team standings are not available in this deployment.', 'info');
    }
  }

  async function goToLeaderboard(){
    if(!guardViewRoute('leaderboard','view the scoreboard')) return;
    const session = await getSession();
    if(!session){ redirectToLoginFromNav('view the scoreboard'); return; }
    currentNav = 'leaderboard'; updateActiveNav();
    showView('leaderboard');
    window.scrollTo({top:0, behavior:'auto'});
    syncAccountSubnav(session);
    renderScoreboardMode('solo');
    document.getElementById('lb-selected-user')?.classList.add('hidden');

    try{
      /* 100 is the server's hard cap for a leaderboard page, so this is the
         whole board rather than an arbitrary slice. */
      const response = await CyberYardHubAPI.leaderboard.list({ limit: 100, offset: 0 });
      currentLeaderboard = response.leaderboard || [];
      renderPodium(currentLeaderboard);
      renderLeaderboardTable(currentLeaderboard);
      setText('lb-standings-note', currentLeaderboard.length
        ? `${formatPoints(currentLeaderboard.length)} operator${currentLeaderboard.length === 1 ? '' : 's'} ranked by total points.`
        : 'No operator has scored yet.');

      const me = currentLeaderboard.find(entry => entry.id === session.id)
        || currentLeaderboard.find(entry => entry.username === session.username);
      const initial = (session.username || '?').charAt(0).toUpperCase();
      setText('lb-you-username', session.username);
      setText('lb-you-avatar', initial);
      if(me){
        setText('lb-you-rank', `#${me.rank}`);
        setText('lb-you-points', formatPoints(me.points));
        setText('lb-you-solved', String(me.solved));
        setText('lb-you-xp', formatPoints(me.xp));
        setText('lb-you-level', String(me.level));
        setText('lb-you-first-bloods', String(me.firstBloods));
        setText('lb-you-streak', `${me.currentStreak}d`);
      }else{
        const stats = await loadUserStats();
        setText('lb-you-rank', `#${stats.rank}`);
        setText('lb-you-points', formatPoints(stats.points));
        setText('lb-you-solved', String(stats.solved));
        setText('lb-you-xp', formatPoints(stats.xp || 0));
        setText('lb-you-level', String(stats.level || 1));
        setText('lb-you-first-bloods', String(stats.firstBloodCount || 0));
        setText('lb-you-streak', `${stats.currentStreak}d`);
      }
      document.getElementById('lb-ellipsis')?.classList.toggle('hidden', currentLeaderboard.length === 0);
      document.getElementById('lb-you-row')?.classList.remove('hidden');
    }catch(e){
      if(isUnauthorizedError(e)){ redirectToLoginFromNav('view the scoreboard'); return; }
      document.getElementById('lb-podium').innerHTML = '<div class="board-empty">The scoreboard could not be loaded right now.</div>';
      document.getElementById('lb-table-body').innerHTML = '';
      document.getElementById('lb-you-row')?.classList.add('hidden');
    }
  }
  /* ---------- secure operator console: URL-gated management workspace ---------- */
  const OPS_TABS = Object.freeze([
    { id: 'overview', label: 'Overview' },
    { id: 'users', label: 'Users' },
    { id: 'teams', label: 'Teams' },
    { id: 'challenges', label: 'Challenges' },
    { id: 'categories', label: 'Categories' },
    { id: 'difficulties', label: 'Difficulties' },
    { id: 'scores', label: 'Scores' },
    { id: 'submissions', label: 'Submissions' },
    { id: 'first-bloods', label: 'First Bloods' },
    { id: 'events', label: 'Events' },
    { id: 'reports', label: 'Community Reports' },
    { id: 'badges', label: 'Badges' },
    { id: 'extras', label: 'Hints & Files' },
    { id: 'instances', label: 'Instances' },
    { id: 'system', label: 'System' }
  ]);
  const OPS_PAGE_SIZE = 20;
  let opsTab = 'overview';
  let opsShellReady = false;
  let opsIdentityExpiresAt = 0;
  let opsIdentityPromise = null;
  let opsConfirmPromise = null;
  let opsConfirmExpected = '';
  let opsModalReturnFocus = null;
  let opsLogTimer = null;
  let opsSelectedEventId = null;
  let opsSelectedExtrasChallengeId = null;
  let opsSelectedTeamId = null;
  let opsCategories = [];
  let opsDifficulties = [];
  let opsChallengeRows = [];
  let opsSearchTimer = null;
  const opsOffsets = { challenges: 0, teams: 0, submissions: 0, firstBloods: 0, events: 0, reports: 0, categories: 0, difficulties: 0, badges: 0, hints: 0, files: 0, instances: 0, users: 0, eventParticipants: 0 };
  const opsLists = { categories: [], difficulties: [], badges: [], hints: [], files: [] };
  const opsSeq = Object.create(null);

  function opsNextSeq(name){ opsSeq[name] = (opsSeq[name] || 0) + 1; return opsSeq[name]; }
  function opsIsCurrent(name, seq){ return opsSeq[name] === seq; }
  function opsValue(id){ return document.getElementById(id)?.value?.trim() || ''; }
  function opsNotify(message, type = 'info'){
    if(typeof window.cyhNotify === 'function') window.cyhNotify(message, type);
  }
  function opsError(error, fallback){ return error?.message || fallback || 'The request could not be completed.'; }
  function opsDate(value){ if(!value) return '—'; const d = new Date(value); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(); }
  function opsDateInput(value){ if(!value) return ''; const d = new Date(value); if(Number.isNaN(d.getTime())) return ''; const pad = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  function opsDateFromInput(id){ const value = opsValue(id); if(!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
  function opsOption(value, label, selected){ return `<option value="${escapeHtml(value)}"${String(value) === String(selected ?? '') ? ' selected' : ''}>${escapeHtml(label)}</option>`; }
  function opsPanelHeader(kicker, title, copy){ return `<div class="ops-panel-head"><div><div class="panel-kicker">${escapeHtml(kicker)}</div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(copy)}</p></div></div>`; }
  function opsEmpty(message){ return `<div class="ops-empty">${escapeHtml(message)}</div>`; }
  function opsPagination(containerId, total, limit, offset, action){ const el = document.getElementById(containerId); if(!el) return; const safeLimit = Math.max(1, Number(limit) || OPS_PAGE_SIZE); const safeTotal = Math.max(0, Number(total) || 0); const pages = Math.max(1, Math.ceil(safeTotal / safeLimit)); const page = Math.floor((Number(offset) || 0) / safeLimit) + 1; el.innerHTML = pages <= 1 ? '' : `<div class="ops-pagination"><button class="btn btn-ghost btn-small" type="button" data-ops-action="${escapeHtml(action)}-prev" ${Number(offset) <= 0 ? 'disabled' : ''}>Previous</button><span>Page ${page} / ${pages}</span><button class="btn btn-ghost btn-small" type="button" data-ops-action="${escapeHtml(action)}-next" ${Number(offset) + safeLimit >= safeTotal ? 'disabled' : ''}>Next</button></div>`; }

  function opsPanelMarkup(id){
    const common = (content) => `<section id="ops-panel-${escapeHtml(id)}" class="ops-panel" data-ops-panel="${escapeHtml(id)}" role="tabpanel" aria-labelledby="ops-tab-${escapeHtml(id)}">${content}</section>`;
    if(id === 'overview') return common(`${opsPanelHeader('READOUT', 'Overview', 'A compact operational readout from the server.')}<div class="stat-cards ops-stat-cards"><div class="stat-card"><div class="sc-value" id="ops-stat-total">—</div><div class="sc-label">TOTAL CHALLENGES</div></div><div class="stat-card"><div class="sc-value" id="ops-stat-published">—</div><div class="sc-label">PUBLISHED</div></div><div class="stat-card"><div class="sc-value" id="ops-stat-draft">—</div><div class="sc-label">DRAFTS</div></div><div class="stat-card"><div class="sc-value" id="ops-stat-archived">—</div><div class="sc-label">ARCHIVED</div></div><div class="stat-card"><div class="sc-value" id="ops-stat-solves">—</div><div class="sc-label">TOTAL SOLVES</div></div></div><div class="ops-two-col"><div class="ops-card"><div class="ops-card-head"><h3>Jump to a surface</h3><span class="ops-muted">Client-side tabs</span></div><div class="ops-action-grid">${OPS_TABS.filter(tab => tab.id !== 'overview').map(tab => `<button class="btn btn-ghost btn-small" type="button" data-ops-tab="${escapeHtml(tab.id)}">${escapeHtml(tab.label)}</button>`).join('')}</div></div><div class="ops-card ops-callout"><div class="panel-kicker">AUDIT NOTE</div><h3>Every mutation is server-audited</h3><p>Identity confirmation and typed phrases are client-side safety gates. The API remains the security boundary.</p></div></div>`);
    if(id === 'users') return common(`${opsPanelHeader('DIRECTORY', 'Users', 'There is no admin user-management list endpoint in this contract. Use the closest real surfaces: a user ID lookup and the paginated submission monitor.') }<div class="ops-card"><div class="ops-card-head"><h3>Look up a user</h3><span class="ops-muted">Read-only</span></div><form id="ops-user-lookup-form" class="ops-inline-form"><div class="field"><label for="ops-user-id">User ID</label><input id="ops-user-id" required pattern="[0-9a-fA-F-]{36}" placeholder="UUID"></div><button class="btn btn-primary" type="submit">Open stats</button></form><div id="ops-user-result" class="ops-result"></div></div><div class="ops-card"><div class="ops-card-head"><h3>Observed users</h3><button class="btn btn-ghost btn-small" type="button" data-ops-action="refresh-users">Refresh</button></div><p class="ops-muted">Unique users seen in the current paginated submission monitor response; this is not a user directory.</p><div id="ops-users-list" class="ops-data-list">Loading observed users…</div><div id="ops-users-pagination" class="ops-pagination-slot"></div></div>`);
    if(id === 'teams') return common(`${opsPanelHeader('COLLABORATION', 'Teams', 'Inspect ranked teams, then transfer, kick, or dissolve with step-up verification.') }<div class="ops-card"><div class="ops-card-head"><h3>Team directory</h3><button class="btn btn-ghost btn-small" type="button" data-ops-action="refresh-teams">Refresh</button></div><div id="ops-teams-list" class="ops-data-list">Loading teams…</div><div id="ops-teams-pagination" class="ops-pagination-slot"></div></div><div id="ops-team-detail" class="ops-card ops-team-detail"><div class="ops-empty">Select Manage on a team to load its members.</div></div>`);
    if(id === 'challenges') return common(`${opsPanelHeader('MISSION LIBRARY', 'Challenges', 'Create, edit, publish, archive, and monitor challenge records.') }<div class="ops-toolbar"><input id="ops-challenge-search" type="search" placeholder="Search title or slug…" aria-label="Search challenges"><select id="ops-challenge-category" aria-label="Filter challenge category"><option value="">All categories</option>${opsCategories.map(c => opsOption(c.id, c.name)).join('')}</select><select id="ops-challenge-difficulty" aria-label="Filter challenge difficulty"><option value="">All difficulties</option>${opsDifficulties.map(d => opsOption(d.id, d.name)).join('')}</select><select id="ops-challenge-status" aria-label="Filter challenge status"><option value="ALL">All states</option><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option></select><button class="btn btn-ghost btn-small" type="button" data-ops-action="refresh-challenges">Refresh</button></div><div id="ops-challenges-list" class="ops-data-list">Loading challenges…</div><div id="ops-challenges-pagination" class="ops-pagination-slot"></div><div class="ops-card ops-form-card"><div class="ops-card-head"><h3 id="ops-challenge-form-title">Create challenge</h3><button class="btn btn-ghost btn-small" type="button" data-ops-action="new-challenge">Clear</button></div><form id="ops-challenge-form"><input type="hidden" id="ops-challenge-id"><div class="ops-form-grid"><div class="field"><label for="ops-challenge-title">Title</label><input id="ops-challenge-title" required maxlength="128"></div><div class="field"><label for="ops-challenge-slug">Slug</label><input id="ops-challenge-slug" maxlength="160" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="auto-generated if blank"></div><div class="field"><label for="ops-challenge-points">Points</label><input id="ops-challenge-points" type="number" min="1" max="100000" required value="100"></div><div class="field"><label for="ops-challenge-category-select">Category</label><select id="ops-challenge-category-select" required>${opsCategories.map(c => opsOption(c.id, c.name)).join('')}</select></div><div class="field"><label for="ops-challenge-difficulty-select">Difficulty</label><select id="ops-challenge-difficulty-select" required>${opsDifficulties.map(d => opsOption(d.id, d.name)).join('')}</select></div><div class="field"><label for="ops-challenge-scoring-mode">Scoring mode</label><select id="ops-challenge-scoring-mode"><option value="STATIC">STATIC</option><option value="DYNAMIC">DYNAMIC</option></select></div><div class="field"><label for="ops-challenge-flag-mode">Flag mode</label><select id="ops-challenge-flag-mode"><option value="STATIC">STATIC</option><option value="DYNAMIC">DYNAMIC</option></select></div><div class="field"><label for="ops-challenge-prerequisite">Prerequisite ID (optional)</label><input id="ops-challenge-prerequisite" placeholder="UUID or blank for none"></div><div class="field"><label for="ops-challenge-status-value">Lifecycle status</label><output id="ops-challenge-status-value" class="ops-readonly-value">Draft</output></div></div><div class="field"><label for="ops-challenge-teaser">Teaser</label><input id="ops-challenge-teaser" maxlength="500"></div><div class="field"><label for="ops-challenge-description">Description</label><textarea id="ops-challenge-description" rows="7" maxlength="10000" required></textarea></div><div class="field"><label for="ops-challenge-flag">Flag</label><input id="ops-challenge-flag" type="password" autocomplete="off" placeholder="Required for new challenge; blank keeps an existing flag"></div><label class="checkbox ops-checkbox"><input id="ops-challenge-case-sensitive" type="checkbox" checked> Flag is case-sensitive</label><div class="ops-form-actions"><button class="btn btn-primary" type="submit">Save challenge</button><button class="btn btn-ghost" type="button" data-ops-action="challenge-publish">Publish</button><button class="btn btn-ghost" type="button" data-ops-action="challenge-unpublish">Revert to draft</button><button class="btn btn-danger" type="button" data-ops-action="challenge-archive">Archive</button></div></form><p class="ops-note">Flags are write-only. Existing flag values are never returned by the API.</p></div>`);
    if(id === 'categories') return common(`${opsPanelHeader('TAXONOMY', 'Categories', 'Create and maintain the category taxonomy used by challenges.') }<div class="ops-two-col"><div class="ops-card"><div class="ops-card-head"><h3>Categories</h3><button class="btn btn-ghost btn-small" type="button" data-ops-action="refresh-categories">Refresh</button></div><div id="ops-categories-list" class="ops-data-list">Loading categories…</div><div id="ops-categories-pagination" class="ops-pagination-slot"></div></div><div class="ops-card ops-form-card"><div class="ops-card-head"><h3 id="ops-category-form-title">New category</h3><button class="btn btn-ghost btn-small" type="button" data-ops-action="new-category">Clear</button></div><form id="ops-category-form"><input type="hidden" id="ops-category-id"><div class="field"><label for="ops-category-name">Name</label><input id="ops-category-name" required maxlength="64"></div><div class="field"><label for="ops-category-slug">Slug</label><input id="ops-category-slug" required maxlength="64" pattern="[a-z0-9]+(?:-[a-z0-9]+)*"></div><button class="btn btn-primary" type="submit">Save category</button></form></div></div>`);
    if(id === 'difficulties') return common(`${opsPanelHeader('TAXONOMY', 'Difficulties', 'Keep the ordered difficulty scale consistent for scoring and events.') }<div class="ops-two-col"><div class="ops-card"><div class="ops-card-head"><h3>Difficulties</h3><button class="btn btn-ghost btn-small" type="button" data-ops-action="refresh-difficulties">Refresh</button></div><div id="ops-difficulties-list" class="ops-data-list">Loading difficulties…</div><div id="ops-difficulties-pagination" class="ops-pagination-slot"></div></div><div class="ops-card ops-form-card"><div class="ops-card-head"><h3 id="ops-difficulty-form-title">New difficulty</h3><button class="btn btn-ghost btn-small" type="button" data-ops-action="new-difficulty">Clear</button></div><form id="ops-difficulty-form"><input type="hidden" id="ops-difficulty-id"><div class="field"><label for="ops-difficulty-name">Name</label><input id="ops-difficulty-name" required maxlength="32"></div><div class="field"><label for="ops-difficulty-order">Sort order</label><input id="ops-difficulty-order" type="number" min="0" max="100000" required value="0"></div><button class="btn btn-primary" type="submit">Save difficulty</button></form></div></div>`);
    if(id === 'scores') return common(`${opsPanelHeader('LEDGER', 'Scores', 'Apply a signed correction to a user score.') }<div class="ops-card ops-form-card"><form id="ops-score-form"><div class="ops-form-grid"><div class="field"><label for="ops-score-user">User ID</label><input id="ops-score-user" required pattern="[0-9a-fA-F-]{36}" placeholder="UUID"></div><div class="field"><label for="ops-score-delta">Delta</label><input id="ops-score-delta" type="number" min="-10000" max="10000" step="1" required placeholder="e.g. 25 or -10"></div><div class="field ops-field-wide"><label for="ops-score-reason">Reason (required for audit)</label><input id="ops-score-reason" required maxlength="200"></div></div><button class="btn btn-primary" type="submit">Apply score adjustment</button></form><div id="ops-score-result" class="ops-result"></div><p class="ops-note">There is no adjustment-history list endpoint. Adjustments are audited server-side; this console shows the result and links to user stats.</p></div>`);
    if(id === 'submissions') return common(`${opsPanelHeader('MONITOR', 'Submissions', 'Read-only monitor with optional user, challenge, and correctness filters.') }<div class="ops-toolbar"><input id="ops-submission-user" placeholder="User ID (optional)" aria-label="Filter submissions by user ID"><input id="ops-submission-challenge" placeholder="Challenge ID (optional)" aria-label="Filter submissions by challenge ID"><select id="ops-submission-correct" aria-label="Filter submissions by correctness"><option value="">All results</option><option value="correct">Correct</option><option value="incorrect">Incorrect</option></select><button class="btn btn-ghost btn-small" type="button" data-ops-action="refresh-submissions">Refresh</button><button class="btn btn-ghost btn-small" type="button" data-ops-action="reset-submission-filters">Reset</button></div><div id="ops-submissions-list" class="ops-data-list">Loading submissions…</div><div id="ops-submissions-pagination" class="ops-pagination-slot"></div>`);
    if(id === 'first-bloods') return common(`${opsPanelHeader('MONITOR', 'First Bloods', 'Read-only first-solve monitor with an optional challenge filter.') }<div class="ops-toolbar"><input id="ops-first-blood-challenge" placeholder="Challenge ID (optional)" aria-label="Filter first bloods by challenge ID"><button class="btn btn-ghost btn-small" type="button" data-ops-action="refresh-first-bloods">Refresh</button><button class="btn btn-ghost btn-small" type="button" data-ops-action="reset-first-blood-filters">Reset</button></div><div id="ops-first-bloods-list" class="ops-data-list">Loading first bloods…</div><div id="ops-first-bloods-pagination" class="ops-pagination-slot"></div>`);
    if(id === 'events') return common(`${opsPanelHeader('MISSIONS', 'Events', 'Create events, control publication, and manage event challenge composition.') }<div class="ops-two-col"><div class="ops-card"><div class="ops-card-head"><h3>Event list</h3><button class="btn btn-ghost btn-small" type="button" data-ops-action="refresh-events">Refresh</button></div><div class="ops-toolbar ops-toolbar-compact"><input id="ops-event-search" type="search" placeholder="Search events…"><select id="ops-event-status"><option value="">All states</option><option value="DRAFT">Draft</option><option value="UPCOMING">Upcoming</option><option value="LIVE">Live</option><option value="ENDED">Ended</option><option value="ARCHIVED">Archived</option></select></div><div id="ops-events-list" class="ops-data-list">Loading events…</div><div id="ops-events-pagination" class="ops-pagination-slot"></div></div><div class="ops-card ops-form-card"><div class="ops-card-head"><h3 id="ops-event-form-title">New event</h3><button class="btn btn-ghost btn-small" type="button" data-ops-action="new-event">Clear</button></div><form id="ops-event-form"><input type="hidden" id="ops-event-id"><div class="ops-form-grid"><div class="field"><label for="ops-event-name">Name</label><input id="ops-event-name" required maxlength="160"></div><div class="field"><label for="ops-event-slug">Slug</label><input id="ops-event-slug" maxlength="180" pattern="[a-z0-9]+(?:-[a-z0-9]+)*"></div><div class="field ops-field-wide"><label for="ops-event-short">Short description</label><input id="ops-event-short" maxlength="500"></div><div class="field"><label for="ops-event-reg-start">Registration starts</label><input id="ops-event-reg-start" type="datetime-local" required></div><div class="field"><label for="ops-event-reg-end">Registration ends</label><input id="ops-event-reg-end" type="datetime-local" required></div><div class="field"><label for="ops-event-start">Event starts</label><input id="ops-event-start" type="datetime-local" required></div><div class="field"><label for="ops-event-end">Event ends</label><input id="ops-event-end" type="datetime-local" required></div><div class="field"><label for="ops-event-max">Max participants</label><input id="ops-event-max" type="number" min="1" max="100000"></div></div><div class="field"><label for="ops-event-description">Description</label><textarea id="ops-event-description" rows="5" maxlength="12000" required></textarea></div><label class="checkbox ops-checkbox"><input id="ops-event-registration-required" type="checkbox" checked> Registration required</label><div class="ops-form-actions"><button class="btn btn-primary" type="submit">Save event</button><button class="btn btn-ghost" type="button" data-ops-action="event-publish">Publish</button><button class="btn btn-danger" type="button" data-ops-action="event-archive">Archive</button></div></form></div></div><div id="ops-event-detail" class="ops-card"><div class="ops-empty">Select Manage on an event to edit its challenges, announcements, participants, and stats.</div></div>`);
    if(id === 'reports') return common(`${opsPanelHeader('MODERATION', 'Community Reports', 'Review reports and apply the server-supported moderation states.') }<div class="ops-toolbar"><select id="ops-report-status"><option value="">All reports</option><option value="PENDING">Pending</option><option value="REVIEWED">Reviewed</option><option value="RESOLVED">Resolved</option><option value="DISMISSED">Dismissed</option></select><button class="btn btn-ghost btn-small" type="button" data-ops-action="refresh-reports">Refresh</button></div><div id="ops-reports-list" class="ops-data-list">Loading reports…</div><div id="ops-reports-pagination" class="ops-pagination-slot"></div>`);
    if(id === 'badges') return common(`${opsPanelHeader('ACHIEVEMENTS', 'Badges', 'Manage enabled and disabled achievement definitions. Award history is preserved server-side.') }<div class="ops-two-col"><div class="ops-card"><div class="ops-card-head"><h3>Badge definitions</h3><button class="btn btn-ghost btn-small" type="button" data-ops-action="refresh-badges">Refresh</button></div><div id="ops-badges-list" class="ops-data-list">Loading badges…</div><div id="ops-badges-pagination" class="ops-pagination-slot"></div></div><div class="ops-card ops-form-card"><div class="ops-card-head"><h3 id="ops-badge-form-title">New badge</h3><button class="btn btn-ghost btn-small" type="button" data-ops-action="new-badge">Clear</button></div><form id="ops-badge-form"><input type="hidden" id="ops-badge-id"><div class="field"><label for="ops-badge-name">Name</label><input id="ops-badge-name" required maxlength="80"></div><div class="field"><label for="ops-badge-slug">Slug</label><input id="ops-badge-slug" required maxlength="80" pattern="[a-z0-9]+(?:-[a-z0-9]+)*"></div><div class="field"><label for="ops-badge-icon">Icon identifier</label><input id="ops-badge-icon" required maxlength="64" value="star"></div><div class="field"><label for="ops-badge-description">Description</label><textarea id="ops-badge-description" rows="3" required maxlength="500"></textarea></div><div class="field"><label for="ops-badge-type">Criteria type</label><select id="ops-badge-type"><option value="first_solve">First solve</option><option value="solved_count">Solved count</option><option value="total_points">Total points</option><option value="category_solved">Category solves</option><option value="streak">Streak days</option><option value="level">Level</option><option value="first_blood_count">First blood count</option><option value="difficulty_solved">Difficulty solves</option></select></div><div class="field"><label for="ops-badge-number">Threshold</label><input id="ops-badge-number" type="number" min="1" max="100000000"></div><div class="field"><label for="ops-badge-category">Category (category criteria)</label><select id="ops-badge-category"><option value="">Select category</option>${opsCategories.map(c => opsOption(c.id, c.name)).join('')}</select></div><div class="field"><label for="ops-badge-difficulty">Difficulty (difficulty criteria)</label><select id="ops-badge-difficulty"><option value="">Select difficulty</option>${opsDifficulties.map(d => opsOption(d.id, d.name)).join('')}</select></div><label class="checkbox ops-checkbox"><input id="ops-badge-enabled" type="checkbox" checked> Enabled</label><button class="btn btn-primary" type="submit">Save badge</button></form></div></div>`);
    if(id === 'extras') return common(`${opsPanelHeader('AUTHORED ASSETS', 'Hints & Files', 'Manage hints, downloadable files, and writeups for a selected challenge.') }<div class="ops-card"><div class="ops-card-head"><h3>Challenge asset editor</h3><button class="btn btn-ghost btn-small" type="button" data-ops-action="refresh-extras">Refresh</button></div><div class="ops-toolbar ops-toolbar-compact"><select id="ops-extras-challenge" aria-label="Select challenge for extras"><option value="">Select a challenge</option>${opsChallengeRows.map(c => opsOption(c.id, `${c.title} · ${c.status}`)).join('')}</select></div><div id="ops-extras-summary" class="ops-muted">Select a challenge to load its authored resources.</div></div><div class="ops-two-col"><div class="ops-card"><div class="ops-card-head"><h3>Hints</h3><button class="btn btn-ghost btn-small" type="button" data-ops-action="new-hint">New hint</button></div><div id="ops-hints-list" class="ops-data-list">Select a challenge first.</div><div id="ops-hints-pagination" class="ops-pagination-slot"></div><form id="ops-hint-form" class="ops-form-card ops-nested-form"><input type="hidden" id="ops-hint-id"><div class="ops-form-grid"><div class="field"><label for="ops-hint-title">Title</label><input id="ops-hint-title" required maxlength="128"></div><div class="field"><label for="ops-hint-cost">Cost</label><input id="ops-hint-cost" type="number" min="0" max="100000" value="0"></div><div class="field"><label for="ops-hint-order">Order</label><input id="ops-hint-order" type="number" min="0" max="100000" value="0"></div></div><div class="field"><label for="ops-hint-content">Content</label><textarea id="ops-hint-content" rows="4" required maxlength="10000"></textarea></div><label class="checkbox ops-checkbox"><input id="ops-hint-enabled" type="checkbox" checked> Enabled</label><button class="btn btn-primary" type="submit">Save hint</button><button class="btn btn-ghost" type="button" data-ops-action="new-hint">Clear</button></form></div><div class="ops-card"><div class="ops-card-head"><h3>Files</h3><label class="btn btn-ghost btn-small" for="ops-file-input">Upload file</label><input id="ops-file-input" type="file" hidden></div><div id="ops-files-list" class="ops-data-list">Select a challenge first.</div><div id="ops-files-pagination" class="ops-pagination-slot"></div></div></div><div class="ops-card"><div class="ops-card-head"><h3>Writeup</h3><div class="ops-inline-actions"><button class="btn btn-primary btn-small" type="button" data-ops-action="save-writeup">Save</button><button class="btn btn-danger btn-small" type="button" data-ops-action="delete-writeup">Delete</button></div></div><textarea id="ops-writeup-content" rows="8" maxlength="50000" placeholder="Select a challenge to edit its writeup…"></textarea><label class="checkbox ops-checkbox"><input id="ops-writeup-published" type="checkbox"> Publish after solve</label><div id="ops-writeup-status" class="ops-muted"></div></div>`);
    if(id === 'instances') return common(`${opsPanelHeader('RUNTIME HEALTH', 'Instances', 'Check registered challenge processes and reset one instance through its HTTP reset path.') }<div class="ops-card"><div class="ops-card-head"><h3>Instance health</h3><button class="btn btn-ghost btn-small" type="button" data-ops-action="refresh-instances">Refresh</button></div><div id="ops-instances-list" class="ops-data-list">Loading instances…</div><div id="ops-instances-pagination" class="ops-pagination-slot"></div></div>`);
    if(id === 'system') return common(`${opsPanelHeader('PLATFORM TELEMETRY', 'System', 'Live SSE counts and a bounded tail of the active rotating server log.') }<div class="ops-two-col"><div class="ops-card"><div class="ops-card-head"><h3>Realtime stats</h3><button class="btn btn-ghost btn-small" type="button" data-ops-action="refresh-system">Refresh</button></div><div class="ops-metric-grid"><div><span>Connected users</span><strong id="ops-realtime-users">—</strong></div><div><span>Open streams</span><strong id="ops-realtime-streams">—</strong></div></div><p class="ops-note">Stats come from <code>/api/admin/realtime-stats</code> and are not cached by the console.</p></div><div class="ops-card"><div class="ops-card-head"><h3>Log tail</h3><div class="ops-inline-actions"><label class="ops-check-inline"><input id="ops-log-auto" type="checkbox"> Refresh every 15s while visible</label><button class="btn btn-ghost btn-small" type="button" data-ops-action="refresh-logs">Refresh logs</button></div></div><pre id="ops-log-lines" class="ops-log" tabindex="0" aria-label="Recent server log lines"></pre></div></div>`);
    return common(opsEmpty('This surface is unavailable.'));
  }

  function opsInitConsole(){
    if(opsShellReady) return;
    opsShellReady = true;
    const tabs = document.getElementById('admin-tabs');
    const panels = document.getElementById('admin-panels');
    if(!tabs || !panels) return;
    tabs.innerHTML = OPS_TABS.map(tab => `<button class="ops-tab" id="ops-tab-${escapeHtml(tab.id)}" type="button" role="tab" data-ops-tab="${escapeHtml(tab.id)}" aria-controls="ops-panel-${escapeHtml(tab.id)}" aria-selected="false" tabindex="-1">${escapeHtml(tab.label)}</button>`).join('');
    panels.innerHTML = OPS_TABS.map(tab => opsPanelMarkup(tab.id)).join('');
    tabs.addEventListener('click', event => { const button = event.target.closest('[data-ops-tab]'); if(button) opsSetTab(button.dataset.opsTab); });
    tabs.addEventListener('keydown', event => {
      const current = event.target.closest('[data-ops-tab]'); if(!current) return;
      if(!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = OPS_TABS.findIndex(tab => tab.id === current.dataset.opsTab);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? OPS_TABS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + OPS_TABS.length) % OPS_TABS.length;
      opsSetTab(OPS_TABS[next].id); document.getElementById(`ops-tab-${OPS_TABS[next].id}`)?.focus();
    });
    panels.addEventListener('click', event => opsHandlePanelClick(event));
    panels.addEventListener('submit', event => opsHandlePanelSubmit(event));
    panels.addEventListener('change', event => opsHandlePanelChange(event));
    document.getElementById('ops-identity-form')?.addEventListener('submit', event => opsSubmitIdentity(event));
    document.querySelectorAll('[data-ops-close]').forEach(button => button.addEventListener('click', () => opsCloseModal(button.dataset.opsClose)));
    document.querySelector('[data-ops-confirm="yes"]')?.addEventListener('click', () => opsSubmitConfirmation());
    document.addEventListener('click', opsHandleGlobalClick);
    document.addEventListener('keydown', event => opsModalKeydown(event));
    opsSetTab('overview', true);
  }

  function opsSetTab(id, initial = false){
    if(!OPS_TABS.some(tab => tab.id === id)) return;
    opsTab = id;
    document.querySelectorAll('#admin-tabs [data-ops-tab]').forEach(button => {
      const active = button.dataset.opsTab === id;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('#admin-panels [data-ops-panel]').forEach(panel => { panel.hidden = panel.dataset.opsPanel !== id; });
    if(id !== 'system') opsStopLogTimer();
    if(!initial) void opsLoadTab(id);
    if(id === 'system') opsSyncLogTimer();
  }

  function opsLoadTab(id = opsTab){
    if(id === 'overview') return opsLoadOverview();
    if(id === 'users') return opsLoadUsers();
    if(id === 'teams') return opsLoadTeams();
    if(id === 'challenges') return opsLoadChallenges();
    if(id === 'categories') return opsLoadCategories();
    if(id === 'difficulties') return opsLoadDifficulties();
    if(id === 'scores') return Promise.resolve();
    if(id === 'submissions') return opsLoadSubmissions();
    if(id === 'first-bloods') return opsLoadFirstBloods();
    if(id === 'events') return opsLoadEvents();
    if(id === 'reports') return opsLoadReports();
    if(id === 'badges') return opsLoadBadges();
    if(id === 'extras') return opsLoadExtrasChallenges();
    if(id === 'instances') return opsLoadInstances();
    if(id === 'system') return Promise.all([opsLoadRealtimeStats(), opsLoadLogs()]);
    return Promise.resolve();
  }

  function opsUpdateIdentityStatus(){
    const remaining = Math.max(0, Math.ceil((opsIdentityExpiresAt - Date.now()) / 60000));
    const status = document.getElementById('admin-identity-status');
    const bar = document.getElementById('admin-identity-bar');
    if(status) status.textContent = remaining > 0 ? `Identity confirmed for approximately ${remaining} more minute${remaining === 1 ? '' : 's'}.` : 'Identity confirmation is required for protected actions.';
    bar?.classList.toggle('is-confirmed', remaining > 0);
  }

  function opsModalFocusable(modal){
    return [...(modal?.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])') || [])].filter(el => !el.closest('[hidden]'));
  }
  function opsOpenModal(kind){
    const modal = document.getElementById(kind === 'identity' ? 'ops-identity-modal' : 'ops-confirm-modal');
    if(!modal) return;
    opsModalReturnFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('ops-modal-open');
    requestAnimationFrame(() => { if(kind === 'identity') document.getElementById('ops-identity-password')?.focus(); else document.getElementById('ops-confirm-input')?.focus(); });
  }
  function opsCloseModal(kind){
    const modal = document.getElementById(kind === 'identity' ? 'ops-identity-modal' : 'ops-confirm-modal');
    if(!modal) return;
    modal.hidden = true;
    if(kind === 'identity'){
      const input = document.getElementById('ops-identity-password'); if(input) input.value = '';
      const error = document.getElementById('ops-identity-error'); if(error){ error.classList.remove('show'); const am = error.querySelector('.am'); if(am) am.textContent = ''; }
      if(opsIdentityPromise){ const resolve = opsIdentityPromise; opsIdentityPromise = null; resolve(false); }
    }else{
      const input = document.getElementById('ops-confirm-input'); if(input) input.value = '';
      const error = document.getElementById('ops-confirm-error'); if(error){ error.classList.remove('show'); const am = error.querySelector('.am'); if(am) am.textContent = ''; }
      if(opsConfirmPromise){ const resolve = opsConfirmPromise; opsConfirmPromise = null; resolve(false); }
      opsConfirmExpected = '';
    }
    if(!document.querySelector('.ops-modal:not([hidden])')) document.body.classList.remove('ops-modal-open');
    if(opsModalReturnFocus && typeof opsModalReturnFocus.focus === 'function') requestAnimationFrame(() => opsModalReturnFocus.focus());
    opsModalReturnFocus = null;
  }
  function opsModalKeydown(event){
    const modal = [...document.querySelectorAll('.ops-modal')].find(item => !item.hidden); if(!modal) return;
    if(event.key === 'Escape'){ event.preventDefault(); opsCloseModal(modal.id === 'ops-identity-modal' ? 'identity' : 'confirm'); return; }
    if(event.key !== 'Tab') return;
    const focusable = opsModalFocusable(modal); if(!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if(event.shiftKey && document.activeElement === first){ event.preventDefault(); last.focus(); }
    else if(!event.shiftKey && document.activeElement === last){ event.preventDefault(); first.focus(); }
  }

  async function opsEnsureIdentity(){
    opsUpdateIdentityStatus();
    if(opsIdentityExpiresAt > Date.now()) return true;
    if(opsIdentityPromise) return opsIdentityPromise;
    opsIdentityPromise = new Promise(resolve => { window.__opsIdentityResolve = resolve; });
    opsOpenModal('identity');
    return opsIdentityPromise;
  }
  async function opsSubmitIdentity(event){
    event.preventDefault();
    const input = document.getElementById('ops-identity-password');
    const password = input?.value || '';
    if(!password){ const error = document.getElementById('ops-identity-error'); if(error){ error.querySelector('.am').textContent = 'Enter your password to continue.'; error.classList.add('show'); } return; }
    const submit = event.target.querySelector('button[type="submit"]'); if(submit){ submit.disabled = true; submit.textContent = 'Checking…'; }
    try{
      const result = await apiRequest('/admin/verify-identity', { method: 'POST', body: { password } });
      const expires = Date.parse(result?.expiresAt || '');
      if(result?.verified !== true || !Number.isFinite(expires)) throw new Error('Identity confirmation was not accepted.');
      opsIdentityExpiresAt = expires; opsUpdateIdentityStatus();
      const resolveIdentity = opsIdentityPromise; opsIdentityPromise = null;
      if(resolveIdentity) resolveIdentity(true);
      opsCloseModal('identity');
      opsNotify('Identity confirmed for protected actions.', 'success');
    }catch(error){
      const alert = document.getElementById('ops-identity-error');
      if(alert){ alert.querySelector('.am').textContent = error?.code === 'IDENTITY_NOT_CONFIRMED' ? 'Identity could not be confirmed.' : opsError(error, 'Identity could not be confirmed.'); alert.classList.add('show'); }
      if(input) input.value = '';
      input?.focus();
    }finally{ if(submit){ submit.disabled = false; submit.textContent = 'Verify identity'; } }
  }
  async function opsAskPhrase(label, phrase, message){
    opsConfirmExpected = phrase;
    const title = document.getElementById('ops-confirm-title');
    const copy = document.getElementById('ops-confirm-message');
    const inputLabel = document.getElementById('ops-confirm-label');
    const input = document.getElementById('ops-confirm-input');
    if(title) title.textContent = label;
    if(copy) copy.textContent = message;
    if(inputLabel) inputLabel.textContent = `Type ${phrase} exactly to continue`;
    if(input) input.value = '';
    const error = document.getElementById('ops-confirm-error'); if(error){ error.classList.remove('show'); const am = error.querySelector('.am'); if(am) am.textContent = ''; }
    opsConfirmPromise = new Promise(resolve => { window.__opsConfirmResolve = resolve; });
    opsOpenModal('confirm');
    return opsConfirmPromise;
  }
  function opsSubmitConfirmation(){
    if(!opsConfirmPromise) return;
    const input = document.getElementById('ops-confirm-input');
    if(!input || input.value !== opsConfirmExpected){
      const error = document.getElementById('ops-confirm-error');
      if(error){ error.querySelector('.am').textContent = `The phrase must match exactly: ${opsConfirmExpected}`; error.classList.add('show'); }
      input?.focus(); return;
    }
    const resolve = opsConfirmPromise; opsConfirmPromise = null; const modal = document.getElementById('ops-confirm-modal');
    if(modal) modal.hidden = true;
    if(!document.querySelector('.ops-modal:not([hidden])')) document.body.classList.remove('ops-modal-open');
    if(opsModalReturnFocus && typeof opsModalReturnFocus.focus === 'function') requestAnimationFrame(() => opsModalReturnFocus.focus());
    opsModalReturnFocus = null;
    resolve(true);
  }
  async function opsGate(phrase, label, message){
    const verified = await opsEnsureIdentity();
    if(!verified) return false;
    if(phrase){
      const confirmed = await opsAskPhrase(label, phrase, message);
      if(!confirmed) return false;
    }
    if(opsIdentityExpiresAt <= Date.now()){ opsIdentityExpiresAt = 0; opsUpdateIdentityStatus(); return false; }
    return true;
  }

  let opsReferencePromise = null;
  async function opsLoadReferenceData(){
    if(opsReferencePromise) return opsReferencePromise;
    opsReferencePromise = (async () => {
      const [categories, difficulties] = await Promise.all([CyberYardHubAPI.admin.categories.list(), CyberYardHubAPI.admin.difficulties.list()]);
      opsCategories = categories.categories || []; opsDifficulties = difficulties.difficulties || [];
      ['ops-challenge-category', 'ops-challenge-category-select', 'ops-badge-category'].forEach(id => { const el = document.getElementById(id); if(el){ const value = el.value; el.innerHTML = (id === 'ops-badge-category' ? '<option value="">Select category</option>' : '<option value="">All categories</option>') + opsCategories.map(c => opsOption(c.id, c.name, value)).join(''); } });
      ['ops-challenge-difficulty', 'ops-challenge-difficulty-select', 'ops-badge-difficulty'].forEach(id => { const el = document.getElementById(id); if(el){ const value = el.value; el.innerHTML = (id === 'ops-badge-difficulty' ? '<option value="">Select difficulty</option>' : '<option value="">All difficulties</option>') + opsDifficulties.map(d => opsOption(d.id, d.name, value)).join(''); } });
    })().catch(error => { opsReferencePromise = null; throw error; });
    return opsReferencePromise;
  }
  async function opsRefreshReferenceData(){ opsReferencePromise = null; return opsLoadReferenceData(); }

  async function opsLoadOverview(){
    const root = document.getElementById('ops-stat-total'); if(!root) return;
    const seq = opsNextSeq('overview');
    try{
      await opsLoadReferenceData();
      const response = await CyberYardHubAPI.admin.overview();
      if(!opsIsCurrent('overview', seq)) return;
      const stats = response.overview || {};
      setText('ops-stat-total', String(stats.totalChallenges ?? 0)); setText('ops-stat-published', String(stats.publishedChallenges ?? 0)); setText('ops-stat-draft', String(stats.draftChallenges ?? 0)); setText('ops-stat-archived', String(stats.archivedChallenges ?? 0)); setText('ops-stat-solves', String(stats.totalSolves ?? 0));
    }catch(error){ if(opsIsCurrent('overview', seq)) opsNotify(opsError(error, 'Unable to load overview.'), 'error'); }
  }

  function opsUserCard(user){
    return `<article class="ops-data-row"><div class="ops-row-main"><strong>${escapeHtml(user.username || 'Unknown user')}</strong><span>${escapeHtml(user.id)}</span></div><button class="btn btn-ghost btn-small" type="button" data-ops-action="lookup-user-id" data-ops-id="${escapeHtml(user.id)}">View stats</button></article>`;
  }
  async function opsLoadUsers(){
    const root = document.getElementById('ops-users-list'); if(!root) return;
    const seq = opsNextSeq('users'); root.textContent = 'Loading observed users…';
    try{
      const response = await apiRequest(`/admin/submissions?limit=${OPS_PAGE_SIZE}&offset=${opsOffsets.users || 0}`);
      if(!opsIsCurrent('users', seq)) return;
      const users = []; const seen = new Set();
      for(const row of response.submissions || []){ if(row.user?.id && !seen.has(row.user.id)){ seen.add(row.user.id); users.push(row.user); } }
      root.innerHTML = users.length ? users.map(opsUserCard).join('') : opsEmpty('No users appear in this submission page.');
      opsPagination('ops-users-pagination', response.total || 0, response.limit || OPS_PAGE_SIZE, response.offset || 0, 'users');
    }catch(error){ if(opsIsCurrent('users', seq)) root.innerHTML = opsEmpty(opsError(error, 'Unable to load observed users.')); }
  }
  async function opsLookupUser(id){
    id = String(id || '').trim(); if(!id) return;
    const root = document.getElementById('ops-user-result'); if(!root) return;
    root.innerHTML = '<div class="ops-loading">Loading user profile and stats…</div>';
    try{
      const [profileResponse, statsResponse] = await Promise.all([CyberYardHubAPI.users.profile(id), CyberYardHubAPI.users.stats(id)]);
      const p = profileResponse.profile || {}; const s = statsResponse.stats || {};
      root.innerHTML = `<div class="ops-result-card"><div class="ops-result-head"><strong>${escapeHtml(p.username || s.username || 'User')}</strong><span>${escapeHtml(id)}</span></div><div class="ops-metric-grid"><div><span>Points</span><strong>${escapeHtml(formatPoints(s.points || 0))}</strong></div><div><span>Rank</span><strong>#${escapeHtml(s.rank ?? '—')}</strong></div><div><span>Solves</span><strong>${escapeHtml(s.solved ?? 0)}</strong></div><div><span>First bloods</span><strong>${escapeHtml(s.firstBloodCount ?? s.firstBloods ?? 0)}</strong></div></div><a class="btn btn-ghost btn-small" href="#view-leaderboard" data-ops-action="view-user-stats" data-ops-id="${escapeHtml(id)}">Open user stats</a></div>`;
    }catch(error){ root.innerHTML = `<div class="ops-result ops-result-error">${escapeHtml(opsError(error, 'Unable to load that user.'))}</div>`; }
  }
  async function opsViewUserStats(id){
    if(!id) return;
    try{ await goToLeaderboard(); await selectLeaderboardUser(id); }catch(error){ opsNotify(opsError(error, 'Unable to open user stats.'), 'error'); }
  }

  function opsTeamCard(team){
    return `<article class="ops-data-row"><div class="ops-row-main"><strong>${escapeHtml(team.name || 'Unnamed team')}</strong><span>#${escapeHtml(team.rank ?? '—')} · ${escapeHtml(team.memberCount ?? 0)} members · ${escapeHtml(formatPoints(team.score || 0))} pts · captain ${escapeHtml(team.captainUsername || team.captainId || '—')}</span></div><button class="btn btn-ghost btn-small" type="button" data-ops-action="team-manage" data-ops-id="${escapeHtml(team.id)}">Manage</button></article>`;
  }
  async function opsLoadTeams(){
    const root = document.getElementById('ops-teams-list'); if(!root) return;
    const seq = opsNextSeq('teams'); root.textContent = 'Loading teams…';
    try{
      const response = await apiRequest(`/admin/teams?limit=${OPS_PAGE_SIZE}&offset=${opsOffsets.teams || 0}`);
      if(!opsIsCurrent('teams', seq)) return;
      root.innerHTML = response.teams?.length ? response.teams.map(opsTeamCard).join('') : opsEmpty('No teams configured.');
      opsPagination('ops-teams-pagination', response.total || 0, response.limit || OPS_PAGE_SIZE, response.offset || 0, 'teams');
    }catch(error){ if(opsIsCurrent('teams', seq)) root.innerHTML = opsEmpty(opsError(error, 'Unable to load teams.')); }
  }
  async function opsLoadTeamDetail(id){
    opsSelectedTeamId = String(id || ''); const root = document.getElementById('ops-team-detail'); if(!root || !opsSelectedTeamId) return;
    root.innerHTML = '<div class="ops-loading">Loading team members…</div>';
    try{
      const response = await apiRequest(`/teams/${encodeURIComponent(opsSelectedTeamId)}`); const team = response.team || {};
      const members = team.members || [];
      root.innerHTML = `<div class="ops-card-head"><div><div class="panel-kicker">TEAM DETAIL</div><h3>${escapeHtml(team.name || 'Team')}</h3><span class="ops-muted">Captain: ${escapeHtml(team.captainId || '—')}</span></div><button class="btn btn-ghost btn-small" type="button" data-ops-action="team-dissolve" data-ops-id="${escapeHtml(team.id)}">Dissolve team</button></div><div class="ops-member-list">${members.length ? members.map(member => `<div class="ops-data-row"><div class="ops-row-main"><strong>${escapeHtml(member.username || 'Member')}</strong><span>${escapeHtml(member.role || 'MEMBER')} · ${escapeHtml(member.userId)}</span></div><div class="ops-inline-actions">${member.role !== 'CAPTAIN' ? `<button class="btn btn-ghost btn-small" type="button" data-ops-action="team-transfer" data-ops-id="${escapeHtml(team.id)}" data-ops-user-id="${escapeHtml(member.userId)}">Make captain</button><button class="btn btn-danger btn-small" type="button" data-ops-action="team-kick" data-ops-id="${escapeHtml(team.id)}" data-ops-user-id="${escapeHtml(member.userId)}">Kick</button>` : '<span class="p-tag accent">Captain</span>'}</div></div>`).join('') : opsEmpty('No members returned.')}</div>`;
    }catch(error){ root.innerHTML = opsEmpty(opsError(error, 'Unable to load team members.')); }
  }

  function opsChallengeRow(challenge){
    const state = String(challenge.status || 'DRAFT');
    return `<article class="ops-data-row ops-challenge-row"><div class="ops-row-main"><div class="ops-row-title"><strong>${escapeHtml(challenge.title)}</strong><span class="ops-state ops-state-${escapeHtml(state.toLowerCase())}">${escapeHtml(state)}</span></div><span>${escapeHtml(challenge.category?.name || '')} · ${escapeHtml(challenge.difficulty?.name || '')} · ${escapeHtml(formatPoints(challenge.points || 0))} pts · ${escapeHtml(challenge.scoringMode || 'STATIC')} scoring · ${escapeHtml(challenge.flagMode || 'STATIC')} flag</span><span>${escapeHtml(challenge.solveCount || 0)} solves · ${escapeHtml(challenge.uniqueSolvers || 0)} unique${challenge.prerequisite ? ` · prerequisite: ${escapeHtml(challenge.prerequisite.title)}` : ''}</span></div><div class="ops-row-actions"><button class="btn btn-ghost btn-small" type="button" data-ops-action="challenge-edit" data-ops-id="${escapeHtml(challenge.id)}">Edit</button><button class="btn btn-ghost btn-small" type="button" data-ops-action="challenge-extras" data-ops-id="${escapeHtml(challenge.id)}">Extras</button>${state === 'DRAFT' ? `<button class="btn btn-ghost btn-small" type="button" data-ops-action="challenge-publish" data-ops-id="${escapeHtml(challenge.id)}">Publish</button>` : ''}${state === 'PUBLISHED' ? `<button class="btn btn-ghost btn-small" type="button" data-ops-action="challenge-unpublish" data-ops-id="${escapeHtml(challenge.id)}">Revert</button>` : ''}<button class="btn btn-danger btn-small" type="button" data-ops-action="challenge-reset" data-ops-id="${escapeHtml(challenge.id)}">Reset solves</button><button class="btn btn-danger btn-small" type="button" data-ops-action="challenge-delete" data-ops-id="${escapeHtml(challenge.id)}">Delete</button></div></article>`;
  }
  async function opsLoadChallenges(){
    const root = document.getElementById('ops-challenges-list'); if(!root) return;
    const seq = opsNextSeq('challenges'); root.textContent = 'Loading challenges…';
    try{
      await opsLoadReferenceData();
      const query = new URLSearchParams({ limit: String(OPS_PAGE_SIZE), offset: String(opsOffsets.challenges || 0), status: opsValue('ops-challenge-status') || 'ALL' });
      const search = opsValue('ops-challenge-search'); if(search) query.set('search', search);
      const category = opsValue('ops-challenge-category'); if(category) query.set('categoryId', category);
      const difficulty = opsValue('ops-challenge-difficulty'); if(difficulty) query.set('difficultyId', difficulty);
      const response = await CyberYardHubAPI.admin.challenges.list(Object.fromEntries(query.entries()));
      if(!opsIsCurrent('challenges', seq)) return;
      opsChallengeRows = response.challenges || []; root.innerHTML = opsChallengeRows.length ? opsChallengeRows.map(opsChallengeRow).join('') : opsEmpty('No challenges match these filters.');
      opsPagination('ops-challenges-pagination', response.total || 0, response.limit || OPS_PAGE_SIZE, response.offset || 0, 'challenges');
      const select = document.getElementById('ops-extras-challenge'); if(select){ const selected = select.value; select.innerHTML = '<option value="">Select a challenge</option>' + opsChallengeRows.map(c => opsOption(c.id, `${c.title} · ${c.status}`)).join(''); select.value = selected; }
    }catch(error){ if(opsIsCurrent('challenges', seq)) root.innerHTML = opsEmpty(opsError(error, 'Unable to load challenges.')); }
  }
  function opsResetChallengeForm(){
    const form = document.getElementById('ops-challenge-form'); form?.reset(); if(form) form.querySelector('#ops-challenge-id').value = '';
    const title = document.getElementById('ops-challenge-form-title'); if(title) title.textContent = 'Create challenge';
    const flag = document.getElementById('ops-challenge-flag'); if(flag) flag.placeholder = 'Required for new challenge; blank keeps an existing flag';
    const points = document.getElementById('ops-challenge-points'); if(points) points.value = '100';
    const status = document.getElementById('ops-challenge-status-value'); if(status) status.textContent = 'DRAFT';
    const sensitive = document.getElementById('ops-challenge-case-sensitive'); if(sensitive) sensitive.checked = true;
  }
  async function opsEditChallenge(id){
    try{
      const response = await CyberYardHubAPI.admin.challenges.get(id); const c = response.challenge || {};
      document.getElementById('ops-challenge-id').value = c.id || ''; document.getElementById('ops-challenge-title').value = c.title || ''; document.getElementById('ops-challenge-slug').value = c.slug || ''; document.getElementById('ops-challenge-points').value = c.points || 100; document.getElementById('ops-challenge-category-select').value = String(c.category?.id || ''); document.getElementById('ops-challenge-difficulty-select').value = String(c.difficulty?.id || ''); document.getElementById('ops-challenge-scoring-mode').value = c.scoringMode || 'STATIC'; document.getElementById('ops-challenge-flag-mode').value = c.flagMode || 'STATIC'; document.getElementById('ops-challenge-prerequisite').value = c.prerequisite?.id || ''; document.getElementById('ops-challenge-teaser').value = c.teaser || ''; document.getElementById('ops-challenge-description').value = c.description || ''; document.getElementById('ops-challenge-case-sensitive').checked = c.caseSensitive !== false; document.getElementById('ops-challenge-status-value').textContent = c.status || 'DRAFT'; document.getElementById('ops-challenge-flag').value = ''; document.getElementById('ops-challenge-form-title').textContent = 'Edit challenge'; document.getElementById('ops-challenge-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }catch(error){ opsNotify(opsError(error, 'Unable to load that challenge.'), 'error'); }
  }
  function opsChallengePayload(){
    const id = opsValue('ops-challenge-id'); const payload = { title: opsValue('ops-challenge-title'), slug: opsValue('ops-challenge-slug') || undefined, teaser: opsValue('ops-challenge-teaser') || null, description: opsValue('ops-challenge-description'), categoryId: Number(opsValue('ops-challenge-category-select')), difficultyId: Number(opsValue('ops-challenge-difficulty-select')), points: Number(opsValue('ops-challenge-points')), scoringMode: opsValue('ops-challenge-scoring-mode') || 'STATIC', flagMode: opsValue('ops-challenge-flag-mode') || 'STATIC', prerequisiteId: opsValue('ops-challenge-prerequisite') || null, caseSensitive: !!document.getElementById('ops-challenge-case-sensitive')?.checked };
    const flag = opsValue('ops-challenge-flag'); if(!id || flag) payload.flag = flag; return payload;
  }
  async function opsSaveChallenge(event){
    event.preventDefault(); const payload = opsChallengePayload(); const id = opsValue('ops-challenge-id');
    if(!id && !payload.flag){ opsNotify('A flag is required when creating a challenge.', 'error'); return; }
    const button = event.target.querySelector('button[type="submit"]'); if(button) button.disabled = true;
    try{ if(id) await CyberYardHubAPI.admin.challenges.update(id, payload); else await CyberYardHubAPI.admin.challenges.create(payload); opsNotify(id ? 'Challenge updated securely.' : 'Challenge created securely.', 'success'); opsResetChallengeForm(); opsOffsets.challenges = 0; await Promise.all([opsLoadOverview(), opsLoadChallenges()]); }catch(error){ opsNotify(opsError(error, 'Unable to save challenge.'), 'error'); }finally{ if(button) button.disabled = false; }
  }
  async function opsChallengeTransition(action, id){
    if(!id) { opsNotify('Save or select a challenge first.', 'error'); return; }
    if((action === 'publish' || action === 'unpublish') && !await opsGate(null, `${action === 'publish' ? 'Publish' : 'Revert'} challenge`, 'This changes the challenge lifecycle for participants.')) return;
    const phrases = { archive: 'ARCHIVE', reset: 'RESET-SOLVES', delete: 'DELETE' };
    if(phrases[action]){ if(!await opsGate(phrases[action], action === 'reset' ? 'Reset challenge solves' : action === 'delete' ? 'Delete challenge' : 'Archive challenge', action === 'reset' ? 'All submissions, solves, and first-blood records for this challenge will be removed.' : action === 'delete' ? 'Deletion is permanent when the server permits it. Historical records may require archiving instead.' : 'The challenge will stop accepting submissions and leave active lists.')) return; }
    try{ await CyberYardHubAPI.admin.challenges[action](id); opsNotify(`Challenge ${action === 'reset' ? 'solves reset' : action === 'delete' ? 'deleted' : action + 'ed'}.`, 'success'); if(action !== 'delete') await opsEditChallenge(id); else opsResetChallengeForm(); await Promise.all([opsLoadOverview(), opsLoadChallenges()]); }catch(error){ opsNotify(opsError(error, 'Unable to change challenge state.'), 'error'); }
  }

  function opsLocalRows(rootId, rows, pageSize, offset){ const root = document.getElementById(rootId); if(!root) return; const page = rows.slice(Number(offset) || 0, (Number(offset) || 0) + pageSize); root.innerHTML = page.length ? page.join('') : opsEmpty('Nothing to show.'); }
  function opsCategoryRow(category){ return `<article class="ops-data-row"><div class="ops-row-main"><strong>${escapeHtml(category.name)}</strong><span>${escapeHtml(category.slug)} · ${escapeHtml(category._count?.challenges ?? 0)} challenges</span></div><div class="ops-row-actions"><button class="btn btn-ghost btn-small" type="button" data-ops-action="category-edit" data-ops-id="${escapeHtml(category.id)}">Edit</button><button class="btn btn-danger btn-small" type="button" data-ops-action="category-delete" data-ops-id="${escapeHtml(category.id)}">Delete</button></div></article>`; }
  async function opsLoadCategories(){
    const root = document.getElementById('ops-categories-list'); if(!root) return; const seq = opsNextSeq('categories');
    try{ const response = await CyberYardHubAPI.admin.categories.list(); if(!opsIsCurrent('categories', seq)) return; opsLists.categories = response.categories || []; const rows = opsLists.categories.slice(opsOffsets.categories || 0, (opsOffsets.categories || 0) + OPS_PAGE_SIZE).map(opsCategoryRow); root.innerHTML = rows.length ? rows.join('') : opsEmpty('No categories configured.'); opsPagination('ops-categories-pagination', opsLists.categories.length, OPS_PAGE_SIZE, opsOffsets.categories || 0, 'categories'); }catch(error){ if(opsIsCurrent('categories', seq)) root.innerHTML = opsEmpty(opsError(error, 'Unable to load categories.')); }
  }
  function opsResetCategoryForm(){ const form = document.getElementById('ops-category-form'); form?.reset(); const id = document.getElementById('ops-category-id'); if(id) id.value = ''; const title = document.getElementById('ops-category-form-title'); if(title) title.textContent = 'New category'; }
  function opsEditCategory(id){ const row = opsLists.categories.find(item => String(item.id) === String(id)); if(!row) return; document.getElementById('ops-category-id').value = row.id; document.getElementById('ops-category-name').value = row.name || ''; document.getElementById('ops-category-slug').value = row.slug || ''; document.getElementById('ops-category-form-title').textContent = 'Edit category'; document.getElementById('ops-category-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  async function opsSaveCategory(event){ event.preventDefault(); const id = opsValue('ops-category-id'); const payload = { name: opsValue('ops-category-name'), slug: opsValue('ops-category-slug') }; const button = event.target.querySelector('button[type="submit"]'); if(button) button.disabled = true; try{ if(id) await CyberYardHubAPI.admin.categories.update(id, payload); else await CyberYardHubAPI.admin.categories.create(payload); opsResetCategoryForm(); opsNotify('Category saved.', 'success'); await opsRefreshReferenceData(); opsOffsets.categories = 0; await Promise.all([opsLoadCategories(), opsLoadOverview()]); }catch(error){ opsNotify(opsError(error, 'Unable to save category.'), 'error'); }finally{ if(button) button.disabled = false; } }
  async function opsDeleteCategory(id){ if(!await opsGate('DELETE', 'Delete category', 'Categories referenced by challenges cannot be deleted; the server will reject unsafe changes.')) return; try{ await CyberYardHubAPI.admin.categories.remove(id); opsNotify('Category deleted.', 'success'); await opsRefreshReferenceData(); await Promise.all([opsLoadCategories(), opsLoadOverview()]); }catch(error){ opsNotify(opsError(error, 'Unable to delete category.'), 'error'); } }

  function opsDifficultyRow(difficulty){ return `<article class="ops-data-row"><div class="ops-row-main"><strong>${escapeHtml(difficulty.name)}</strong><span>Order ${escapeHtml(difficulty.sortOrder ?? 0)} · ${escapeHtml(difficulty._count?.challenges ?? 0)} challenges</span></div><div class="ops-row-actions"><button class="btn btn-ghost btn-small" type="button" data-ops-action="difficulty-edit" data-ops-id="${escapeHtml(difficulty.id)}">Edit</button><button class="btn btn-danger btn-small" type="button" data-ops-action="difficulty-delete" data-ops-id="${escapeHtml(difficulty.id)}">Delete</button></div></article>`; }
  async function opsLoadDifficulties(){ const root = document.getElementById('ops-difficulties-list'); if(!root) return; const seq = opsNextSeq('difficulties'); try{ const response = await CyberYardHubAPI.admin.difficulties.list(); if(!opsIsCurrent('difficulties', seq)) return; opsLists.difficulties = response.difficulties || []; const rows = opsLists.difficulties.slice(opsOffsets.difficulties || 0, (opsOffsets.difficulties || 0) + OPS_PAGE_SIZE).map(opsDifficultyRow); root.innerHTML = rows.length ? rows.join('') : opsEmpty('No difficulties configured.'); opsPagination('ops-difficulties-pagination', opsLists.difficulties.length, OPS_PAGE_SIZE, opsOffsets.difficulties || 0, 'difficulties'); }catch(error){ if(opsIsCurrent('difficulties', seq)) root.innerHTML = opsEmpty(opsError(error, 'Unable to load difficulties.')); } }
  function opsResetDifficultyForm(){ const form = document.getElementById('ops-difficulty-form'); form?.reset(); const id = document.getElementById('ops-difficulty-id'); if(id) id.value = ''; const order = document.getElementById('ops-difficulty-order'); if(order) order.value = '0'; const title = document.getElementById('ops-difficulty-form-title'); if(title) title.textContent = 'New difficulty'; }
  function opsEditDifficulty(id){ const row = opsLists.difficulties.find(item => String(item.id) === String(id)); if(!row) return; document.getElementById('ops-difficulty-id').value = row.id; document.getElementById('ops-difficulty-name').value = row.name || ''; document.getElementById('ops-difficulty-order').value = row.sortOrder ?? 0; document.getElementById('ops-difficulty-form-title').textContent = 'Edit difficulty'; }
  async function opsSaveDifficulty(event){ event.preventDefault(); const id = opsValue('ops-difficulty-id'); const payload = { name: opsValue('ops-difficulty-name'), sortOrder: Number(opsValue('ops-difficulty-order')) }; const button = event.target.querySelector('button[type="submit"]'); if(button) button.disabled = true; try{ if(id) await CyberYardHubAPI.admin.difficulties.update(id, payload); else await CyberYardHubAPI.admin.difficulties.create(payload); opsResetDifficultyForm(); opsNotify('Difficulty saved.', 'success'); await opsRefreshReferenceData(); opsOffsets.difficulties = 0; await Promise.all([opsLoadDifficulties(), opsLoadOverview()]); }catch(error){ opsNotify(opsError(error, 'Unable to save difficulty.'), 'error'); }finally{ if(button) button.disabled = false; } }
  async function opsDeleteDifficulty(id){ if(!await opsGate('DELETE', 'Delete difficulty', 'Difficulties referenced by challenges cannot be deleted; the server will reject unsafe changes.')) return; try{ await CyberYardHubAPI.admin.difficulties.remove(id); opsNotify('Difficulty deleted.', 'success'); await opsRefreshReferenceData(); await Promise.all([opsLoadDifficulties(), opsLoadOverview()]); }catch(error){ opsNotify(opsError(error, 'Unable to delete difficulty.'), 'error'); } }

  async function opsSaveScore(event){
    event.preventDefault(); if(!await opsGate(null, 'Adjust score', '')) return;
    const payload = { userId: opsValue('ops-score-user'), delta: Number(opsValue('ops-score-delta')), reason: opsValue('ops-score-reason') };
    const resultRoot = document.getElementById('ops-score-result'); const button = event.target.querySelector('button[type="submit"]'); if(button) button.disabled = true;
    try{ const response = await apiRequest('/admin/scores/adjust', { method: 'POST', body: payload }); const adjustment = response.adjustment || {}; if(resultRoot) resultRoot.innerHTML = `<div class="ops-result-card"><strong>Adjustment applied</strong><span>${escapeHtml(adjustment.reason || payload.reason)} · ${escapeHtml(formatPoints(adjustment.delta || payload.delta))} points</span><button class="btn btn-ghost btn-small" type="button" data-ops-action="view-user-stats" data-ops-id="${escapeHtml(payload.userId)}">Open user stats</button></div>`; opsNotify('Score adjustment applied and audited server-side.', 'success'); }catch(error){ if(resultRoot) resultRoot.innerHTML = `<div class="ops-result ops-result-error">${escapeHtml(opsError(error, 'Unable to adjust score.'))}</div>`; }finally{ if(button) button.disabled = false; }
  }

  function opsSubmissionRow(row){ return `<article class="ops-data-row"><div class="ops-row-main"><strong>${escapeHtml(row.user?.username || 'Unknown user')}</strong><span>${escapeHtml(row.challenge?.title || 'Unknown challenge')} · ${row.correct ? 'Correct' : 'Incorrect'} · ${escapeHtml(opsDate(row.createdAt))}</span><span>${escapeHtml(row.user?.id || '')}</span></div></article>`; }
  async function opsLoadSubmissions(){ const root = document.getElementById('ops-submissions-list'); if(!root) return; const seq = opsNextSeq('submissions'); root.textContent = 'Loading submissions…'; try{ const query = new URLSearchParams({ limit: String(OPS_PAGE_SIZE), offset: String(opsOffsets.submissions || 0) }); const user = opsValue('ops-submission-user'); const challenge = opsValue('ops-submission-challenge'); const correct = opsValue('ops-submission-correct'); if(user) query.set('userId', user); if(challenge) query.set('challengeId', challenge); if(correct) query.set('correct', correct); const response = await apiRequest(`/admin/submissions?${query}`); if(!opsIsCurrent('submissions', seq)) return; root.innerHTML = response.submissions?.length ? response.submissions.map(opsSubmissionRow).join('') : opsEmpty('No submissions match these filters.'); opsPagination('ops-submissions-pagination', response.total || 0, response.limit || OPS_PAGE_SIZE, response.offset || 0, 'submissions'); }catch(error){ if(opsIsCurrent('submissions', seq)) root.innerHTML = opsEmpty(opsError(error, 'Unable to load submissions.')); } }
  function opsFirstBloodRow(row){ return `<article class="ops-data-row"><div class="ops-row-main"><strong>${escapeHtml(row.username || 'Unknown user')}</strong><span>${escapeHtml(row.challengeTitle || 'Unknown challenge')} · ${escapeHtml(opsDate(row.solvedAt))}</span><span>${escapeHtml(row.userId || '')} · ${escapeHtml(row.challengeId || '')}</span></div></article>`; }
  async function opsLoadFirstBloods(){ const root = document.getElementById('ops-first-bloods-list'); if(!root) return; const seq = opsNextSeq('first-bloods'); root.textContent = 'Loading first bloods…'; try{ const query = new URLSearchParams({ limit: String(OPS_PAGE_SIZE), offset: String(opsOffsets.firstBloods || 0) }); const challenge = opsValue('ops-first-blood-challenge'); if(challenge) query.set('challengeId', challenge); const response = await apiRequest(`/admin/first-bloods?${query}`); if(!opsIsCurrent('first-bloods', seq)) return; root.innerHTML = response.firstBloods?.length ? response.firstBloods.map(opsFirstBloodRow).join('') : opsEmpty('No first-blood records match this filter.'); opsPagination('ops-first-bloods-pagination', response.total || 0, response.limit || OPS_PAGE_SIZE, response.offset || 0, 'first-bloods'); }catch(error){ if(!opsIsCurrent('first-bloods', seq)) return; root.innerHTML = opsEmpty(opsError(error, 'Unable to load first bloods.')); } }

  function opsEventRow(event){ return `<article class="ops-data-row"><div class="ops-row-main"><strong>${escapeHtml(event.name)}</strong><span>${escapeHtml(eventStatusLabel(event.status))} · ${escapeHtml(opsDate(event.startAt))} · ${escapeHtml(event.participantCount ?? 0)} participants · ${escapeHtml(event.challengeCount ?? 0)} challenges</span></div><button class="btn btn-ghost btn-small" type="button" data-ops-action="event-edit" data-ops-id="${escapeHtml(event.id)}">Manage</button></article>`; }
  async function opsLoadEvents(){ const root = document.getElementById('ops-events-list'); if(!root) return; const seq = opsNextSeq('events'); root.textContent = 'Loading events…'; try{ const query = new URLSearchParams({ limit: String(OPS_PAGE_SIZE), offset: String(opsOffsets.events || 0) }); const search = opsValue('ops-event-search'); const status = opsValue('ops-event-status'); if(search) query.set('search', search); if(status) query.set('status', status); const response = await CyberYardHubAPI.admin.events.list(Object.fromEntries(query.entries())); if(!opsIsCurrent('events', seq)) return; root.innerHTML = response.events?.length ? response.events.map(opsEventRow).join('') : opsEmpty('No events configured.'); opsPagination('ops-events-pagination', response.total || 0, response.limit || OPS_PAGE_SIZE, response.offset || 0, 'events'); }catch(error){ if(opsIsCurrent('events', seq)) root.innerHTML = opsEmpty(opsError(error, 'Unable to load events.')); } }
  function opsResetEventForm(){ document.getElementById('ops-event-form')?.reset(); opsOffsets.eventParticipants = 0; const id = document.getElementById('ops-event-id'); if(id) id.value = ''; const required = document.getElementById('ops-event-registration-required'); if(required) required.checked = true; const title = document.getElementById('ops-event-form-title'); if(title) title.textContent = 'New event'; const detail = document.getElementById('ops-event-detail'); if(detail) detail.innerHTML = '<div class="ops-empty">Select Manage on an event to edit its challenges, announcements, participants, and stats.</div>'; opsSelectedEventId = null; }
  async function opsEditEvent(id){ try{ const response = await CyberYardHubAPI.admin.events.get(id); const event = response.event || {}; opsSelectedEventId = id; opsOffsets.eventParticipants = 0; document.getElementById('ops-event-id').value = id; document.getElementById('ops-event-name').value = event.name || ''; document.getElementById('ops-event-slug').value = event.slug || ''; document.getElementById('ops-event-short').value = event.shortDescription || ''; document.getElementById('ops-event-description').value = response.details?.description || ''; document.getElementById('ops-event-reg-start').value = opsDateInput(event.registrationStartAt); document.getElementById('ops-event-reg-end').value = opsDateInput(event.registrationEndAt); document.getElementById('ops-event-start').value = opsDateInput(event.startAt); document.getElementById('ops-event-end').value = opsDateInput(event.endAt); document.getElementById('ops-event-max').value = event.maxParticipants || ''; document.getElementById('ops-event-registration-required').checked = !!event.registrationRequired; document.getElementById('ops-event-form-title').textContent = 'Edit event'; await opsLoadEventDetail(id); }catch(error){ opsNotify(opsError(error, 'Unable to load that event.'), 'error'); } }
  function opsEventPayload(){ const max = opsValue('ops-event-max'); return { name: opsValue('ops-event-name'), slug: opsValue('ops-event-slug') || undefined, shortDescription: opsValue('ops-event-short') || undefined, description: opsValue('ops-event-description'), registrationStartAt: opsDateFromInput('ops-event-reg-start'), registrationEndAt: opsDateFromInput('ops-event-reg-end'), startAt: opsDateFromInput('ops-event-start'), endAt: opsDateFromInput('ops-event-end'), maxParticipants: max ? Number(max) : null, registrationRequired: !!document.getElementById('ops-event-registration-required')?.checked }; }
  async function opsSaveEvent(event){ event.preventDefault(); const id = opsValue('ops-event-id'); const button = event.target.querySelector('button[type="submit"]'); if(button) button.disabled = true; try{ const payload = opsEventPayload(); if(id) await CyberYardHubAPI.admin.events.update(id, payload); else { const response = await CyberYardHubAPI.admin.events.create(payload); opsSelectedEventId = response.event?.id || null; } opsNotify('Event saved.', 'success'); await opsLoadEvents(); if(opsSelectedEventId) await opsEditEvent(opsSelectedEventId); }catch(error){ opsNotify(opsError(error, 'Unable to save event.'), 'error'); }finally{ if(button) button.disabled = false; } }
  async function opsEventTransition(action, id = opsSelectedEventId){ if(!id){ opsNotify('Select an event first.', 'error'); return; } if(action === 'publish' && !await opsGate(null, 'Publish event', 'Participants will be able to discover this event.')) return; if(action === 'archive' && !await opsGate('ARCHIVE-EVENT', 'Archive event', 'The event will leave active lists and its schedule will be preserved.')) return; try{ await CyberYardHubAPI.admin.events[action](id); opsNotify(`Event ${action === 'publish' ? 'published' : 'archived'}.`, 'success'); await Promise.all([opsLoadEvents(), opsEditEvent(id)]); }catch(error){ opsNotify(opsError(error, 'Unable to change event state.'), 'error'); } }
  async function opsLoadEventDetail(id){ if(!id) return; const root = document.getElementById('ops-event-detail'); if(!root) return; root.innerHTML = '<div class="ops-loading">Loading event composition…</div>'; try{ const [response, published, participants] = await Promise.all([CyberYardHubAPI.admin.events.get(id), CyberYardHubAPI.admin.challenges.list({ status: 'PUBLISHED', limit: 50, offset: 0 }), CyberYardHubAPI.admin.events.participants(id, { limit: OPS_PAGE_SIZE, offset: opsOffsets.eventParticipants || 0 })]); const event = response.event || {}; const challenges = response.challenges || []; const announcements = response.announcements || []; const stats = response.stats || {}; const challengeOptions = (published.challenges || []).map(challenge => opsOption(challenge.id, `${challenge.title} · ${formatPoints(challenge.points)} pts`)).join(''); root.innerHTML = `<div class="ops-card-head"><div><div class="panel-kicker">SELECTED EVENT</div><h3>${escapeHtml(event.name || 'Event')}</h3><span class="ops-muted">${escapeHtml(eventStatusLabel(event.status))} · ${escapeHtml(opsDate(event.startAt))}</span></div><button class="btn btn-ghost btn-small" type="button" data-ops-action="event-clear-selection">Close detail</button></div><div class="ops-event-stats ops-metric-grid"><div><span>Registrations</span><strong>${escapeHtml(stats.totalRegistrations ?? 0)}</strong></div><div><span>Active participants</span><strong>${escapeHtml(stats.activeParticipants ?? 0)}</strong></div><div><span>Solves</span><strong>${escapeHtml(stats.totalSolves ?? 0)}</strong></div><div><span>First bloods</span><strong>${escapeHtml(stats.firstBloodCount ?? 0)}</strong></div></div><div class="ops-subpanel"><div class="ops-card-head"><h4>Attached challenges</h4></div><div class="ops-data-list">${challenges.length ? challenges.map((row, index) => `<div class="ops-data-row"><div class="ops-row-main"><strong>${escapeHtml(row.challenge?.title || row.challengeId)}</strong><span>Position ${escapeHtml(row.position ?? index + 1)} · ${escapeHtml(row.challenge?.status || '')}</span></div><div class="ops-inline-actions"><button class="btn btn-ghost btn-small" type="button" data-ops-action="event-challenge-up" data-ops-id="${escapeHtml(id)}" data-ops-index="${index}" ${index === 0 ? 'disabled' : ''}>↑</button><button class="btn btn-ghost btn-small" type="button" data-ops-action="event-challenge-down" data-ops-id="${escapeHtml(id)}" data-ops-index="${index}" ${index === challenges.length - 1 ? 'disabled' : ''}>↓</button><button class="btn btn-danger btn-small" type="button" data-ops-action="event-challenge-remove" data-ops-id="${escapeHtml(id)}" data-ops-challenge-id="${escapeHtml(row.challengeId)}">Remove</button></div></div>`).join('') : opsEmpty('No challenges attached.')}</div><div class="ops-inline-form ops-event-challenge-form"><select id="ops-event-challenge-select" aria-label="Published challenge to add"><option value="">Select published challenge</option>${challengeOptions}</select><input id="ops-event-challenge-position" type="number" min="1" value="${challenges.length + 1}" aria-label="Challenge position"><button class="btn btn-ghost btn-small" type="button" data-ops-action="event-challenge-add" data-ops-id="${escapeHtml(id)}">Add challenge</button></div></div><div class="ops-subpanel"><div class="ops-card-head"><h4>Announcements</h4></div><div class="ops-data-list">${announcements.length ? announcements.map(item => `<div class="ops-data-row"><div class="ops-row-main"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.content)}</span></div><button class="btn btn-danger btn-small" type="button" data-ops-action="event-announcement-delete" data-ops-id="${escapeHtml(id)}" data-ops-announcement-id="${escapeHtml(item.id)}">Delete</button></div>`).join('') : opsEmpty('No announcements.')}</div><form id="ops-event-announcement-form" class="ops-nested-form"><div class="field"><label for="ops-event-announcement-title">Announcement title</label><input id="ops-event-announcement-title" required maxlength="160"></div><div class="field"><label for="ops-event-announcement-content">Announcement content</label><textarea id="ops-event-announcement-content" rows="3" required maxlength="5000"></textarea></div><button class="btn btn-ghost btn-small" type="submit">Publish announcement</button></form></div><div class="ops-subpanel"><div class="ops-card-head"><h4>Participants</h4><span class="ops-muted">${escapeHtml(participants.total ?? 0)} total</span></div><div class="ops-data-list">${participants.participants?.length ? participants.participants.map(person => `<div class="ops-data-row"><div class="ops-row-main"><strong>${escapeHtml(person.user?.username || 'Participant')}</strong><span>${escapeHtml(opsDate(person.registeredAt))}</span></div><button class="btn btn-danger btn-small" type="button" data-ops-action="event-participant-remove" data-ops-id="${escapeHtml(id)}" data-ops-registration-id="${escapeHtml(person.id)}">Remove</button></div>`).join('') : opsEmpty('No participants.')}</div><div id="ops-event-participants-pagination" class="ops-pagination-slot"></div></div>`; opsPagination('ops-event-participants-pagination', participants.total || 0, participants.limit || OPS_PAGE_SIZE, participants.offset || 0, 'event-participants'); document.querySelectorAll('#ops-event-participants-pagination [data-ops-action]').forEach(button => { button.dataset.opsId = id; }); }catch(error){ root.innerHTML = opsEmpty(opsError(error, 'Unable to load event details.')); } }
  async function opsAddEventChallenge(id){ const challengeId = opsValue('ops-event-challenge-select'); if(!challengeId){ opsNotify('Select a published challenge.', 'error'); return; } try{ await CyberYardHubAPI.admin.events.addChallenge(id, { challengeId, position: Number(opsValue('ops-event-challenge-position')) || undefined }); opsNotify('Challenge added to event.', 'success'); await opsLoadEventDetail(id); }catch(error){ opsNotify(opsError(error, 'Unable to add event challenge.'), 'error'); } }
  async function opsMoveEventChallenge(id, index, direction){ try{ const response = await CyberYardHubAPI.admin.events.get(id); const rows = [...(response.challenges || [])].sort((a, b) => (a.position || 0) - (b.position || 0)); const next = index + direction; if(next < 0 || next >= rows.length) return; [rows[index], rows[next]] = [rows[next], rows[index]]; await CyberYardHubAPI.admin.events.reorderChallenges(id, { items: rows.map((row, i) => ({ challengeId: row.challengeId, position: i + 1 })) }); await opsLoadEventDetail(id); }catch(error){ opsNotify(opsError(error, 'Unable to reorder event challenges.'), 'error'); } }
  async function opsRemoveEventChallenge(id, challengeId){ if(!await opsGate(null, 'Remove event challenge', '')) return; try{ await CyberYardHubAPI.admin.events.removeChallenge(id, challengeId); await opsLoadEventDetail(id); }catch(error){ opsNotify(opsError(error, 'Unable to remove event challenge.'), 'error'); } }
  async function opsSaveAnnouncement(event){ event.preventDefault(); if(!opsSelectedEventId){ opsNotify('Select an event first.', 'error'); return; } try{ await CyberYardHubAPI.admin.events.createAnnouncement(opsSelectedEventId, { title: opsValue('ops-event-announcement-title'), content: opsValue('ops-event-announcement-content') }); event.target.reset(); opsNotify('Announcement published.', 'success'); await opsLoadEventDetail(opsSelectedEventId); }catch(error){ opsNotify(opsError(error, 'Unable to publish announcement.'), 'error'); } }
  async function opsDeleteAnnouncement(id, announcementId){ if(!await opsGate('DELETE', 'Delete announcement', 'This announcement will be permanently removed.')) return; try{ await CyberYardHubAPI.admin.events.removeAnnouncement(id, announcementId); await opsLoadEventDetail(id); }catch(error){ opsNotify(opsError(error, 'Unable to delete announcement.'), 'error'); } }
  async function opsRemoveParticipant(id, registrationId){ if(!await opsGate(null, 'Remove event participant', 'The participant registration will be removed.')) return; try{ await CyberYardHubAPI.admin.events.removeParticipant(id, registrationId); await opsLoadEventDetail(id); }catch(error){ opsNotify(opsError(error, 'Unable to remove participant.'), 'error'); } }

  function opsReportRow(report){ const target = report.post ? `Post: ${report.post.title}` : report.comment ? `Comment: ${(report.comment.content || '').slice(0, 180)}` : 'Content unavailable'; return `<article class="ops-data-row ops-report-row"><div class="ops-row-main"><strong>${escapeHtml(report.reason)} · ${escapeHtml(report.status)}</strong><span>${escapeHtml(target)} · reported by ${escapeHtml(report.reporter?.username || 'Unknown')} · ${escapeHtml(opsDate(report.createdAt))}</span>${report.description ? `<span>${escapeHtml(report.description)}</span>` : ''}</div><div class="ops-row-actions">${report.post ? `<button class="btn btn-danger btn-small" type="button" data-ops-action="report-delete-post" data-ops-id="${escapeHtml(report.post.id)}" data-ops-report-id="${escapeHtml(report.id)}">Remove post</button>` : ''}${report.comment ? `<button class="btn btn-danger btn-small" type="button" data-ops-action="report-delete-comment" data-ops-id="${escapeHtml(report.comment.postId)}" data-ops-comment-id="${escapeHtml(report.comment.id)}" data-ops-report-id="${escapeHtml(report.id)}">Remove comment</button>` : ''}<button class="btn btn-ghost btn-small" type="button" data-ops-action="report-update" data-ops-id="${escapeHtml(report.id)}" data-ops-report-status="REVIEWED">Review</button><button class="btn btn-ghost btn-small" type="button" data-ops-action="report-update" data-ops-id="${escapeHtml(report.id)}" data-ops-report-status="RESOLVED">Resolve</button><button class="btn btn-ghost btn-small" type="button" data-ops-action="report-update" data-ops-id="${escapeHtml(report.id)}" data-ops-report-status="DISMISSED">Dismiss</button></div></article>`; }
  async function opsLoadReports(){ const root = document.getElementById('ops-reports-list'); if(!root) return; const seq = opsNextSeq('reports'); root.textContent = 'Loading reports…'; try{ const status = opsValue('ops-report-status'); const query = new URLSearchParams({ limit: String(OPS_PAGE_SIZE), offset: String(opsOffsets.reports || 0) }); if(status) query.set('status', status); const response = await CyberYardHubAPI.admin.community.reports.list(Object.fromEntries(query.entries())); if(!opsIsCurrent('reports', seq)) return; root.innerHTML = response.reports?.length ? response.reports.map(opsReportRow).join('') : opsEmpty('No reports in this view.'); opsPagination('ops-reports-pagination', response.total || 0, response.limit || OPS_PAGE_SIZE, response.offset || 0, 'reports'); }catch(error){ if(opsIsCurrent('reports', seq)) root.innerHTML = opsEmpty(opsError(error, 'Unable to load reports.')); } }
  async function opsUpdateReport(id, status){ if(!await opsGate(null, 'Update community report', '')) return; try{ await CyberYardHubAPI.admin.community.reports.update(id, { status }); await opsLoadReports(); }catch(error){ opsNotify(opsError(error, 'Unable to update report.'), 'error'); } }
  async function opsDeleteReportedPost(postId, reportId){ if(!await opsGate('DELETE', 'Remove reported post', 'The reported post and its replies will be removed.')) return; try{ await CyberYardHubAPI.admin.community.deletePost(postId); await CyberYardHubAPI.admin.community.reports.update(reportId, { status: 'RESOLVED' }); await opsLoadReports(); }catch(error){ opsNotify(opsError(error, 'Unable to moderate post.'), 'error'); } }
  async function opsDeleteReportedComment(postId, commentId, reportId){ if(!await opsGate('DELETE', 'Remove reported comment', 'The reported comment will be removed.')) return; try{ await CyberYardHubAPI.admin.community.deleteComment(postId, commentId); await CyberYardHubAPI.admin.community.reports.update(reportId, { status: 'RESOLVED' }); await opsLoadReports(); }catch(error){ opsNotify(opsError(error, 'Unable to moderate comment.'), 'error'); } }

  function opsBadgeRow(badge){ return `<article class="ops-data-row"><div class="ops-row-main"><strong>${escapeHtml(badge.name)}</strong><span>${escapeHtml(badge.slug)} · ${escapeHtml(badge.criteria?.type || 'criterion')} · ${escapeHtml(badge._count?.awards ?? 0)} awards · ${badge.isEnabled ? 'Enabled' : 'Disabled'}</span></div><div class="ops-row-actions"><button class="btn btn-ghost btn-small" type="button" data-ops-action="badge-edit" data-ops-id="${escapeHtml(badge.id)}">Edit</button><button class="btn btn-danger btn-small" type="button" data-ops-action="badge-delete" data-ops-id="${escapeHtml(badge.id)}">Delete</button></div></article>`; }
  async function opsLoadBadges(){ const root = document.getElementById('ops-badges-list'); if(!root) return; const seq = opsNextSeq('badges'); try{ const response = await CyberYardHubAPI.admin.badges.list(); if(!opsIsCurrent('badges', seq)) return; opsLists.badges = response.badges || []; const page = opsLists.badges.slice(opsOffsets.badges || 0, (opsOffsets.badges || 0) + OPS_PAGE_SIZE).map(opsBadgeRow); root.innerHTML = page.length ? page.join('') : opsEmpty('No badges configured.'); opsPagination('ops-badges-pagination', opsLists.badges.length, OPS_PAGE_SIZE, opsOffsets.badges || 0, 'badges'); }catch(error){ if(opsIsCurrent('badges', seq)) root.innerHTML = opsEmpty(opsError(error, 'Unable to load badges.')); } }
  function opsResetBadgeForm(){ document.getElementById('ops-badge-form')?.reset(); const id = document.getElementById('ops-badge-id'); if(id) id.value = ''; const icon = document.getElementById('ops-badge-icon'); if(icon) icon.value = 'star'; const enabled = document.getElementById('ops-badge-enabled'); if(enabled) enabled.checked = true; const title = document.getElementById('ops-badge-form-title'); if(title) title.textContent = 'New badge'; }
  function opsEditBadge(id){ const badge = opsLists.badges.find(item => String(item.id) === String(id)); if(!badge) return; const c = badge.criteria || {}; document.getElementById('ops-badge-id').value = badge.id; document.getElementById('ops-badge-name').value = badge.name || ''; document.getElementById('ops-badge-slug').value = badge.slug || ''; document.getElementById('ops-badge-icon').value = badge.icon || 'star'; document.getElementById('ops-badge-description').value = badge.description || ''; document.getElementById('ops-badge-type').value = c.type || 'first_solve'; document.getElementById('ops-badge-number').value = c.count ?? c.points ?? c.days ?? c.level ?? ''; document.getElementById('ops-badge-enabled').checked = !!badge.isEnabled; if(c.categoryId) document.getElementById('ops-badge-category').value = String(c.categoryId); if(c.difficultyId) document.getElementById('ops-badge-difficulty').value = String(c.difficultyId); document.getElementById('ops-badge-form-title').textContent = 'Edit badge'; }
  function opsBadgeCriteria(){ const type = opsValue('ops-badge-type'); const number = Number(opsValue('ops-badge-number')); if(type === 'first_solve') return { type }; if(type === 'solved_count') return { type, count: number }; if(type === 'total_points') return { type, points: number }; if(type === 'category_solved') return { type, categoryId: Number(opsValue('ops-badge-category')), count: number }; if(type === 'streak') return { type, days: number }; if(type === 'level') return { type, level: number }; if(type === 'first_blood_count') return { type, count: number }; if(type === 'difficulty_solved') return { type, difficultyId: Number(opsValue('ops-badge-difficulty')), count: number }; throw new Error('Choose a badge criterion.'); }
  async function opsSaveBadge(event){ event.preventDefault(); const id = opsValue('ops-badge-id'); try{ const payload = { name: opsValue('ops-badge-name'), slug: opsValue('ops-badge-slug'), icon: opsValue('ops-badge-icon'), description: opsValue('ops-badge-description'), criteria: opsBadgeCriteria(), isEnabled: !!document.getElementById('ops-badge-enabled')?.checked }; if(id) await CyberYardHubAPI.admin.badges.update(id, payload); else await CyberYardHubAPI.admin.badges.create(payload); opsResetBadgeForm(); opsNotify('Badge saved.', 'success'); await opsLoadBadges(); }catch(error){ opsNotify(opsError(error, 'Unable to save badge.'), 'error'); } }
  async function opsDeleteBadge(id){ if(!await opsGate('DELETE', 'Delete badge', 'Awarded badges are historical records and cannot be deleted; disable an awarded badge instead.')) return; try{ await CyberYardHubAPI.admin.badges.remove(id); opsNotify('Badge deleted.', 'success'); await opsLoadBadges(); }catch(error){ opsNotify(opsError(error, 'Unable to delete badge.'), 'error'); } }

  async function opsLoadExtrasChallenges(){ const select = document.getElementById('ops-extras-challenge'); if(!select) return; try{ const response = await CyberYardHubAPI.admin.challenges.list({ limit: 50, offset: 0, status: 'ALL' }); opsChallengeRows = response.challenges || []; const selected = select.value || opsSelectedExtrasChallengeId || ''; select.innerHTML = '<option value="">Select a challenge</option>' + opsChallengeRows.map(challenge => opsOption(challenge.id, `${challenge.title} · ${challenge.status}`)).join(''); select.value = selected; if(!opsSelectedExtrasChallengeId && select.value) opsSelectedExtrasChallengeId = select.value; if(opsSelectedExtrasChallengeId) await opsLoadExtras(opsSelectedExtrasChallengeId); }catch(error){ const summary = document.getElementById('ops-extras-summary'); if(summary) summary.textContent = opsError(error, 'Unable to load challenges.'); } }
  function opsHintRow(hint){ return `<article class="ops-data-row"><div class="ops-row-main"><strong>${escapeHtml(hint.title)}</strong><span>${escapeHtml(hint.content)} · ${escapeHtml(hint.cost)} pts · order ${escapeHtml(hint.sortOrder)} · ${hint.isEnabled ? 'Enabled' : 'Disabled'}</span></div><div class="ops-row-actions"><button class="btn btn-ghost btn-small" type="button" data-ops-action="hint-edit" data-ops-id="${escapeHtml(hint.id)}">Edit</button><button class="btn btn-danger btn-small" type="button" data-ops-action="hint-delete" data-ops-id="${escapeHtml(hint.id)}">Delete</button></div></article>`; }
  function opsFileRow(file){ return `<article class="ops-data-row"><div class="ops-row-main"><strong>${escapeHtml(file.originalName)}</strong><span>${escapeHtml(file.mimeType)} · ${escapeHtml(formatFileSize(file.sizeBytes))} · ${file.isEnabled ? 'Enabled' : 'Disabled'}</span></div><div class="ops-row-actions"><button class="btn btn-ghost btn-small" type="button" data-ops-action="file-rename" data-ops-id="${escapeHtml(file.id)}" data-ops-name="${escapeHtml(file.originalName)}">Rename</button><button class="btn btn-ghost btn-small" type="button" data-ops-action="file-toggle" data-ops-id="${escapeHtml(file.id)}" data-ops-enabled="${file.isEnabled ? 'false' : 'true'}">${file.isEnabled ? 'Disable' : 'Enable'}</button><button class="btn btn-danger btn-small" type="button" data-ops-action="file-delete" data-ops-id="${escapeHtml(file.id)}">Delete</button></div></article>`; }
  async function opsLoadExtras(id = opsSelectedExtrasChallengeId){ if(!id) return; opsSelectedExtrasChallengeId = id; const summary = document.getElementById('ops-extras-summary'); if(summary) summary.textContent = 'Loading authored resources…'; try{ const [hints, files, writeup] = await Promise.all([CyberYardHubAPI.admin.hints.list(id), CyberYardHubAPI.admin.files.list(id), CyberYardHubAPI.admin.writeup.get(id)]); opsLists.hints = hints.hints || []; opsLists.files = files.files || []; const hintRows = opsLists.hints.slice(opsOffsets.hints || 0, (opsOffsets.hints || 0) + OPS_PAGE_SIZE).map(opsHintRow); const fileRows = opsLists.files.slice(opsOffsets.files || 0, (opsOffsets.files || 0) + OPS_PAGE_SIZE).map(opsFileRow); const hintRoot = document.getElementById('ops-hints-list'); const fileRoot = document.getElementById('ops-files-list'); if(hintRoot) hintRoot.innerHTML = hintRows.length ? hintRows.join('') : opsEmpty('No hints yet.'); if(fileRoot) fileRoot.innerHTML = fileRows.length ? fileRows.join('') : opsEmpty('No files yet.'); opsPagination('ops-hints-pagination', opsLists.hints.length, OPS_PAGE_SIZE, opsOffsets.hints || 0, 'hints'); opsPagination('ops-files-pagination', opsLists.files.length, OPS_PAGE_SIZE, opsOffsets.files || 0, 'files'); const content = document.getElementById('ops-writeup-content'); const published = document.getElementById('ops-writeup-published'); if(content) content.value = writeup.writeup?.content || ''; if(published) published.checked = !!writeup.writeup?.isPublished; const status = document.getElementById('ops-writeup-status'); if(status) status.textContent = writeup.writeup ? `Writeup ${writeup.writeup.isPublished ? 'published' : 'unpublished'}.` : 'No writeup yet.'; if(summary) summary.textContent = `${opsLists.hints.length} hints · ${opsLists.files.length} files · writeup ${writeup.writeup ? 'present' : 'empty'}`; }catch(error){ if(summary) summary.textContent = opsError(error, 'Unable to load authored resources.'); } }
  function opsResetHintForm(){ document.getElementById('ops-hint-form')?.reset(); const id = document.getElementById('ops-hint-id'); if(id) id.value = ''; const enabled = document.getElementById('ops-hint-enabled'); if(enabled) enabled.checked = true; }
  function opsEditHint(id){ const hint = opsLists.hints.find(item => String(item.id) === String(id)); if(!hint) return; document.getElementById('ops-hint-id').value = hint.id; document.getElementById('ops-hint-title').value = hint.title || ''; document.getElementById('ops-hint-content').value = hint.content || ''; document.getElementById('ops-hint-cost').value = hint.cost ?? 0; document.getElementById('ops-hint-order').value = hint.sortOrder ?? 0; document.getElementById('ops-hint-enabled').checked = !!hint.isEnabled; }
  async function opsSaveHint(event){ event.preventDefault(); if(!opsSelectedExtrasChallengeId){ opsNotify('Select a challenge first.', 'error'); return; } const id = opsValue('ops-hint-id'); const payload = { title: opsValue('ops-hint-title'), content: opsValue('ops-hint-content'), cost: Number(opsValue('ops-hint-cost')), sortOrder: Number(opsValue('ops-hint-order')), isEnabled: !!document.getElementById('ops-hint-enabled')?.checked }; try{ if(id) await CyberYardHubAPI.admin.hints.update(opsSelectedExtrasChallengeId, id, payload); else await CyberYardHubAPI.admin.hints.create(opsSelectedExtrasChallengeId, payload); opsResetHintForm(); await opsLoadExtras(); }catch(error){ opsNotify(opsError(error, 'Unable to save hint.'), 'error'); } }
  async function opsDeleteHint(id){ if(!await opsGate('DELETE', 'Delete hint', 'Existing unlock history will also be removed.')) return; try{ await CyberYardHubAPI.admin.hints.remove(opsSelectedExtrasChallengeId, id); await opsLoadExtras(); }catch(error){ opsNotify(opsError(error, 'Unable to delete hint.'), 'error'); } }
  async function opsUploadFile(input){ const file = input?.files?.[0]; if(!file || !opsSelectedExtrasChallengeId) return; const formData = new FormData(); formData.append('file', file); try{ await CyberYardHubAPI.admin.files.upload(opsSelectedExtrasChallengeId, formData); input.value = ''; await opsLoadExtras(); }catch(error){ opsNotify(opsError(error, 'Unable to upload file.'), 'error'); } }
  async function opsDeleteFile(id){ if(!await opsGate('DELETE', 'Delete challenge file', 'The file will be permanently removed from the challenge.')) return; try{ await CyberYardHubAPI.admin.files.remove(opsSelectedExtrasChallengeId, id); await opsLoadExtras(); }catch(error){ opsNotify(opsError(error, 'Unable to delete file.'), 'error'); } }
  async function opsRenameFile(id, currentName){ const name = window.prompt('File name:', currentName); if(name === null) return; const trimmed = name.trim(); if(!trimmed){ opsNotify('File name cannot be empty.', 'error'); return; } try{ await CyberYardHubAPI.admin.files.update(opsSelectedExtrasChallengeId, id, { originalName: trimmed }); await opsLoadExtras(); }catch(error){ opsNotify(opsError(error, 'Unable to rename file.'), 'error'); } }
  async function opsToggleFile(id, enabled){ try{ await CyberYardHubAPI.admin.files.update(opsSelectedExtrasChallengeId, id, { isEnabled: enabled }); await opsLoadExtras(); }catch(error){ opsNotify(opsError(error, 'Unable to update file.'), 'error'); } }
  async function opsSaveWriteup(){ if(!opsSelectedExtrasChallengeId) return; try{ const existing = await CyberYardHubAPI.admin.writeup.get(opsSelectedExtrasChallengeId); const payload = { content: opsValue('ops-writeup-content'), isPublished: !!document.getElementById('ops-writeup-published')?.checked }; if(existing.writeup) await CyberYardHubAPI.admin.writeup.update(opsSelectedExtrasChallengeId, payload); else await CyberYardHubAPI.admin.writeup.save(opsSelectedExtrasChallengeId, payload); await opsLoadExtras(); }catch(error){ opsNotify(opsError(error, 'Unable to save writeup.'), 'error'); } }
  async function opsDeleteWriteup(){ if(!opsSelectedExtrasChallengeId || !await opsGate('DELETE', 'Delete writeup', 'The writeup will be permanently removed.')) return; try{ await CyberYardHubAPI.admin.writeup.remove(opsSelectedExtrasChallengeId); await opsLoadExtras(); }catch(error){ opsNotify(opsError(error, 'Unable to delete writeup.'), 'error'); } }

  function opsInstanceRow(instance){ const status = String(instance.status || 'disabled'); return `<article class="ops-data-row"><div class="ops-row-main"><strong>${escapeHtml(instance.name || instance.slug)}</strong><span>${escapeHtml(instance.slug)} · ${escapeHtml(status)}${instance.httpStatus ? ` · HTTP ${escapeHtml(instance.httpStatus)}` : ''}${instance.latencyMs != null ? ` · ${escapeHtml(instance.latencyMs)} ms` : ''}</span>${instance.error ? `<span>${escapeHtml(instance.error)}</span>` : ''}</div><button class="btn btn-danger btn-small" type="button" data-ops-action="instance-reset" data-ops-id="${escapeHtml(instance.slug)}" ${instance.enabled === false ? 'disabled' : ''}>Reset instance</button></article>`; }
  async function opsLoadInstances(){ const root = document.getElementById('ops-instances-list'); if(!root) return; const seq = opsNextSeq('instances'); root.textContent = 'Loading instance health…'; try{ const response = await apiRequest('/admin/instances'); if(!opsIsCurrent('instances', seq)) return; const all = response.instances || []; const rows = all.slice(opsOffsets.instances || 0, (opsOffsets.instances || 0) + OPS_PAGE_SIZE); root.innerHTML = rows.length ? rows.map(opsInstanceRow).join('') : opsEmpty('No challenge instances are registered.'); opsPagination('ops-instances-pagination', all.length, OPS_PAGE_SIZE, opsOffsets.instances || 0, 'instances'); }catch(error){ if(opsIsCurrent('instances', seq)) root.innerHTML = opsEmpty(opsError(error, 'Unable to load instances.')); } }
  async function opsResetInstance(slug){ if(!await opsGate('RESET-INSTANCE', 'Reset challenge instance', 'The instance reset path will be called over HTTP and may discard challenge state.')) return; try{ await apiRequest(`/admin/instances/${encodeURIComponent(slug)}/reset`, { method: 'POST' }); opsNotify('Instance reset request completed.', 'success'); await opsLoadInstances(); }catch(error){ opsNotify(opsError(error, 'Unable to reset instance.'), 'error'); } }

  async function opsLoadRealtimeStats(){ try{ const response = await apiRequest('/admin/realtime-stats'); const stats = response.realtime || {}; setText('ops-realtime-users', String(stats.users ?? 0)); setText('ops-realtime-streams', String(stats.streams ?? 0)); }catch(error){ setText('ops-realtime-users', '—'); setText('ops-realtime-streams', '—'); opsNotify(opsError(error, 'Realtime stats are temporarily unavailable.'), 'error'); } }
  async function opsLoadLogs(){ const root = document.getElementById('ops-log-lines'); if(!root) return; const seq = opsNextSeq('logs'); root.textContent = 'Loading log tail…'; try{ const response = await apiRequest('/admin/system/logs?lines=200'); if(!opsIsCurrent('logs', seq)) return; const lines = Array.isArray(response.lines) ? response.lines : []; root.textContent = lines.length ? lines.join('\n') : 'No log lines available.'; }catch(error){ if(opsIsCurrent('logs', seq)) root.textContent = opsError(error, 'Unable to read the log tail.'); } }
  function opsStopLogTimer(){ if(opsLogTimer){ clearInterval(opsLogTimer); opsLogTimer = null; } }
  function opsSyncLogTimer(){ const checkbox = document.getElementById('ops-log-auto'); const shouldRun = opsTab === 'system' && !!checkbox?.checked; opsStopLogTimer(); if(shouldRun) opsLogTimer = setInterval(() => { if(opsTab === 'system') void opsLoadLogs(); }, 15000); }

  function opsHandleGlobalClick(event){
    const button = event.target.closest('[data-ops-action]'); if(!button || button.closest('#admin-panels')) return;
    const action = button.dataset.opsAction;
    if(action === 'verify-identity') void opsEnsureIdentity();
    else if(action === 'refresh-all'){ void opsLoadReferenceData().then(() => opsLoadTab(opsTab)).catch(error => opsNotify(opsError(error, 'Unable to refresh the console.'), 'error')); }
    else if(action === 'logout') void handleLogout();
  }

  async function opsHandlePanelClick(event){
    const tabButton = event.target.closest('[data-ops-tab]');
    if(tabButton){ opsSetTab(tabButton.dataset.opsTab); return; }
    const button = event.target.closest('[data-ops-action]'); if(!button) return;
    event.preventDefault();
    const action = button.dataset.opsAction; const id = button.dataset.opsId || '';
    if(action === 'users-prev' || action === 'users-next'){ opsOffsets.users = Math.max(0, (opsOffsets.users || 0) + (action.endsWith('prev') ? -OPS_PAGE_SIZE : OPS_PAGE_SIZE)); return void opsLoadUsers(); }
    if(action === 'teams-prev' || action === 'teams-next'){ opsOffsets.teams = Math.max(0, (opsOffsets.teams || 0) + (action.endsWith('prev') ? -OPS_PAGE_SIZE : OPS_PAGE_SIZE)); return void opsLoadTeams(); }
    if(action === 'challenges-prev' || action === 'challenges-next'){ opsOffsets.challenges = Math.max(0, (opsOffsets.challenges || 0) + (action.endsWith('prev') ? -OPS_PAGE_SIZE : OPS_PAGE_SIZE)); return void opsLoadChallenges(); }
    if(action === 'categories-prev' || action === 'categories-next'){ opsOffsets.categories = Math.max(0, (opsOffsets.categories || 0) + (action.endsWith('prev') ? -OPS_PAGE_SIZE : OPS_PAGE_SIZE)); return void opsLoadCategories(); }
    if(action === 'difficulties-prev' || action === 'difficulties-next'){ opsOffsets.difficulties = Math.max(0, (opsOffsets.difficulties || 0) + (action.endsWith('prev') ? -OPS_PAGE_SIZE : OPS_PAGE_SIZE)); return void opsLoadDifficulties(); }
    if(action === 'submissions-prev' || action === 'submissions-next'){ opsOffsets.submissions = Math.max(0, (opsOffsets.submissions || 0) + (action.endsWith('prev') ? -OPS_PAGE_SIZE : OPS_PAGE_SIZE)); return void opsLoadSubmissions(); }
    if(action === 'first-bloods-prev' || action === 'first-bloods-next'){ opsOffsets.firstBloods = Math.max(0, (opsOffsets.firstBloods || 0) + (action.endsWith('prev') ? -OPS_PAGE_SIZE : OPS_PAGE_SIZE)); return void opsLoadFirstBloods(); }
    if(action === 'events-prev' || action === 'events-next'){ opsOffsets.events = Math.max(0, (opsOffsets.events || 0) + (action.endsWith('prev') ? -OPS_PAGE_SIZE : OPS_PAGE_SIZE)); return void opsLoadEvents(); }
    if(action === 'reports-prev' || action === 'reports-next'){ opsOffsets.reports = Math.max(0, (opsOffsets.reports || 0) + (action.endsWith('prev') ? -OPS_PAGE_SIZE : OPS_PAGE_SIZE)); return void opsLoadReports(); }
    if(action === 'badges-prev' || action === 'badges-next'){ opsOffsets.badges = Math.max(0, (opsOffsets.badges || 0) + (action.endsWith('prev') ? -OPS_PAGE_SIZE : OPS_PAGE_SIZE)); return void opsLoadBadges(); }
    if(action === 'hints-prev' || action === 'hints-next'){ opsOffsets.hints = Math.max(0, (opsOffsets.hints || 0) + (action.endsWith('prev') ? -OPS_PAGE_SIZE : OPS_PAGE_SIZE)); return void opsLoadExtras(); }
    if(action === 'files-prev' || action === 'files-next'){ opsOffsets.files = Math.max(0, (opsOffsets.files || 0) + (action.endsWith('prev') ? -OPS_PAGE_SIZE : OPS_PAGE_SIZE)); return void opsLoadExtras(); }
    if(action === 'instances-prev' || action === 'instances-next'){ opsOffsets.instances = Math.max(0, (opsOffsets.instances || 0) + (action.endsWith('prev') ? -OPS_PAGE_SIZE : OPS_PAGE_SIZE)); return void opsLoadInstances(); }
    if(action === 'event-participants-prev' || action === 'event-participants-next'){ opsOffsets.eventParticipants = Math.max(0, (opsOffsets.eventParticipants || 0) + (action.endsWith('prev') ? -OPS_PAGE_SIZE : OPS_PAGE_SIZE)); return void opsLoadEventDetail(id); }
    switch(action){
      case 'refresh-overview': return void opsLoadOverview();
      case 'refresh-users': return void opsLoadUsers();
      case 'lookup-user-id': return void opsLookupUser(id);
      case 'view-user-stats': return void opsViewUserStats(id);
      case 'refresh-teams': return void opsLoadTeams();
      case 'team-manage': return void opsLoadTeamDetail(id);
      case 'team-transfer': return void opsTeamTransfer(id, button.dataset.opsUserId);
      case 'team-kick': return void opsTeamKick(id, button.dataset.opsUserId);
      case 'team-dissolve': return void opsTeamDissolve(id);
      case 'refresh-challenges': opsOffsets.challenges = 0; return void opsLoadChallenges();
      case 'new-challenge': return opsResetChallengeForm();
      case 'challenge-edit': return void opsEditChallenge(id);
      case 'challenge-extras': opsSelectedExtrasChallengeId = id; opsSetTab('extras'); return;
      case 'challenge-publish': return void opsChallengeTransition('publish', id);
      case 'challenge-unpublish': return void opsChallengeTransition('unpublish', id);
      case 'challenge-archive': return void opsChallengeTransition('archive', id);
      case 'challenge-reset': return void opsChallengeTransition('reset', id);
      case 'challenge-delete': return void opsChallengeTransition('delete', id);
      case 'refresh-categories': opsOffsets.categories = 0; return void opsLoadCategories();
      case 'new-category': return opsResetCategoryForm();
      case 'category-edit': return opsEditCategory(id);
      case 'category-delete': return void opsDeleteCategory(id);
      case 'refresh-difficulties': opsOffsets.difficulties = 0; return void opsLoadDifficulties();
      case 'new-difficulty': return opsResetDifficultyForm();
      case 'difficulty-edit': return opsEditDifficulty(id);
      case 'difficulty-delete': return void opsDeleteDifficulty(id);
      case 'refresh-submissions': opsOffsets.submissions = 0; return void opsLoadSubmissions();
      case 'reset-submission-filters': ['ops-submission-user','ops-submission-challenge','ops-submission-correct'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; }); opsOffsets.submissions = 0; return void opsLoadSubmissions();
      case 'refresh-first-bloods': opsOffsets.firstBloods = 0; return void opsLoadFirstBloods();
      case 'reset-first-blood-filters': { const el = document.getElementById('ops-first-blood-challenge'); if(el) el.value = ''; opsOffsets.firstBloods = 0; } return void opsLoadFirstBloods();
      case 'refresh-events': opsOffsets.events = 0; return void opsLoadEvents();
      case 'new-event': return opsResetEventForm();
      case 'event-edit': return void opsEditEvent(id);
      case 'event-publish': return void opsEventTransition('publish');
      case 'event-archive': return void opsEventTransition('archive');
      case 'event-clear-selection': opsSelectedEventId = null; return void opsResetEventForm();
      case 'event-challenge-add': return void opsAddEventChallenge(id);
      case 'event-challenge-remove': return void opsRemoveEventChallenge(id, button.dataset.opsChallengeId);
      case 'event-challenge-up': return void opsMoveEventChallenge(id, Number(button.dataset.opsIndex), -1);
      case 'event-challenge-down': return void opsMoveEventChallenge(id, Number(button.dataset.opsIndex), 1);
      case 'event-announcement-delete': return void opsDeleteAnnouncement(id, button.dataset.opsAnnouncementId);
      case 'event-participant-remove': return void opsRemoveParticipant(id, button.dataset.opsRegistrationId);
      case 'refresh-reports': opsOffsets.reports = 0; return void opsLoadReports();
      case 'report-update': return void opsUpdateReport(id, button.dataset.opsReportStatus);
      case 'report-delete-post': return void opsDeleteReportedPost(id, button.dataset.opsReportId);
      case 'report-delete-comment': return void opsDeleteReportedComment(id, button.dataset.opsCommentId, button.dataset.opsReportId);
      case 'refresh-badges': opsOffsets.badges = 0; return void opsLoadBadges();
      case 'new-badge': return opsResetBadgeForm();
      case 'badge-edit': return opsEditBadge(id);
      case 'badge-delete': return void opsDeleteBadge(id);
      case 'refresh-extras': return void opsLoadExtrasChallenges();
      case 'new-hint': return opsResetHintForm();
      case 'hint-edit': return opsEditHint(id);
      case 'hint-delete': return void opsDeleteHint(id);
      case 'file-rename': return void opsRenameFile(id, button.dataset.opsName || '');
      case 'file-toggle': return void opsToggleFile(id, button.dataset.opsEnabled === 'true');
      case 'file-delete': return void opsDeleteFile(id);
      case 'save-writeup': return void opsSaveWriteup();
      case 'delete-writeup': return void opsDeleteWriteup();
      case 'refresh-instances': return void opsLoadInstances();
      case 'instance-reset': return void opsResetInstance(id);
      case 'refresh-system': return void Promise.all([opsLoadRealtimeStats(), opsLoadLogs()]);
      case 'refresh-logs': return void opsLoadLogs();
      default: break;
    }
  }

  async function opsHandlePanelSubmit(event){
    const form = event.target;
    const handlers = { 'ops-user-lookup-form': () => opsLookupUser(opsValue('ops-user-id')), 'ops-challenge-form': opsSaveChallenge, 'ops-category-form': opsSaveCategory, 'ops-difficulty-form': opsSaveDifficulty, 'ops-score-form': opsSaveScore, 'ops-event-form': opsSaveEvent, 'ops-event-announcement-form': opsSaveAnnouncement, 'ops-badge-form': opsSaveBadge, 'ops-hint-form': opsSaveHint };
    const handler = handlers[form.id]; if(!handler) return; event.preventDefault(); await handler(event);
  }
  function opsHandlePanelChange(event){
    const target = event.target;
    if(target.id === 'ops-extras-challenge'){ opsSelectedExtrasChallengeId = target.value || null; opsOffsets.hints = 0; opsOffsets.files = 0; if(target.value) void opsLoadExtras(target.value); return; }
    if(target.id === 'ops-file-input'){ void opsUploadFile(target); return; }
    if(target.id === 'ops-log-auto'){ opsSyncLogTimer(); return; }
    if(target.id === 'ops-badge-type'){ const category = document.getElementById('ops-badge-category'); const difficulty = document.getElementById('ops-badge-difficulty'); if(category) category.disabled = target.value !== 'category_solved'; if(difficulty) difficulty.disabled = target.value !== 'difficulty_solved'; return; }
    if(['ops-challenge-search','ops-challenge-category','ops-challenge-difficulty','ops-challenge-status','ops-event-search','ops-event-status','ops-report-status'].includes(target.id)){ clearTimeout(opsSearchTimer); opsSearchTimer = setTimeout(() => { if(target.id.startsWith('ops-challenge')) opsOffsets.challenges = 0; if(target.id.startsWith('ops-event')) opsOffsets.events = 0; if(target.id === 'ops-report-status') opsOffsets.reports = 0; void opsLoadTab(target.closest('[data-ops-panel]')?.dataset.opsPanel || opsTab); }, 180); }
    if(['ops-submission-user','ops-submission-challenge','ops-submission-correct','ops-first-blood-challenge'].includes(target.id)){ opsOffsets.submissions = 0; opsOffsets.firstBloods = 0; void opsLoadTab(target.closest('[data-ops-panel]')?.dataset.opsPanel || opsTab); }
  }

  async function opsTeamTransfer(teamId, userId){ if(!userId) return; if(!await opsGate('TRANSFER', 'Transfer team captaincy', 'The selected member will immediately become captain and the current captain will become a member.')) return; try{ await apiRequest(`/admin/teams/${encodeURIComponent(teamId)}/transfer`, { method: 'POST', body: { userId } }); opsNotify('Captaincy transferred.', 'success'); await Promise.all([opsLoadTeams(), opsLoadTeamDetail(teamId)]); }catch(error){ opsNotify(opsError(error, 'Unable to transfer captaincy.'), 'error'); } }
  async function opsTeamKick(teamId, userId){ if(!userId) return; if(!await opsGate('KICK', 'Remove team member', 'The selected member will lose access to the team immediately.')) return; try{ await apiRequest(`/admin/teams/${encodeURIComponent(teamId)}/kick`, { method: 'POST', body: { userId } }); opsNotify('Member removed from team.', 'success'); await Promise.all([opsLoadTeams(), opsLoadTeamDetail(teamId)]); }catch(error){ opsNotify(opsError(error, 'Unable to remove member.'), 'error'); } }
  async function opsTeamDissolve(teamId){ if(!teamId) return; if(!await opsGate('DISSOLVE', 'Dissolve team', 'The team and its memberships will be removed. User accounts are not deleted.')) return; try{ await apiRequest(`/admin/teams/${encodeURIComponent(teamId)}`, { method: 'DELETE' }); opsNotify('Team dissolved.', 'success'); opsSelectedTeamId = null; document.getElementById('ops-team-detail')?.replaceChildren(); await opsLoadTeams(); }catch(error){ opsNotify(opsError(error, 'Unable to dissolve team.'), 'error'); } }

  async function openHiddenPanelIfAllowed(){
    const session = await getSession();
    if(!session || session.role !== 'ADMIN'){
      panelEntryAuthorized = false; opsIdentityExpiresAt = 0; currentNav = 'home'; updateActiveNav(); showView('landing'); return;
    }
    panelEntryAuthorized = true;
    await goToAdmin();
  }

  /* Later declaration intentionally supersedes the legacy #view-admin loader. */
  async function goToAdmin(){
    if(!panelEntryAuthorized){ currentNav = 'home'; updateActiveNav(); showView('landing'); return; }
    const session = await getSession();
    if(!session || session.role !== 'ADMIN'){ panelEntryAuthorized = false; opsIdentityExpiresAt = 0; currentNav = 'home'; updateActiveNav(); showView('landing'); return; }
    currentNav = 'admin'; updateActiveNav(); showView('admin'); window.scrollTo({ top: 0, behavior: 'auto' });
opsInitConsole();
    try{ await opsLoadReferenceData(); opsUpdateIdentityStatus(); await opsLoadTab(opsTab); }catch(error){ opsNotify(opsError(error, 'Unable to load the secure console.'), 'error'); }
  }

  /* ---------- challenges (backend-integrated) ---------- */
  /* Challenge data now comes from the real backend (GET /api/challenges,
     GET /api/challenges/:id) — no more MOCK_CHALLENGES array, and no flag
     value of any kind ever exists in this file or arrives in any API
     response. Category/difficulty filter option lists also come from the
     backend (GET /api/categories, GET /api/difficulties) rather than
     being hardcoded, so they stay correct if those ever change. */
  const challengeFilters = { search:'', category:'all', difficulty:'all', solved:'all', sort:'newest' };
  let challengeOffset = 0;
  const challengePageSize = 12;
  let currentChallengeId = null;
  let categoryOptions = ['All'];
  let difficultyOptions = ['All'];
  let challengeFilterOptionsLoaded = false;
  let challengeRequestSeq = 0;
  let searchDebounceTimer = null;

  function setChallengeFilter(type, value){
    challengeFilters[type] = value;
    challengeOffset = 0;
    syncChallengeFilterState();
    loadChallengeGrid();
  }

  function resetChallengeFilters(){
    Object.assign(challengeFilters, { search:'', category:'all', difficulty:'all', solved:'all', sort:'newest' });
    challengeOffset = 0;
    const search = document.getElementById('chal-search-input');
    if(search) search.value = '';
    syncChallengeFilterState();
    loadChallengeGrid();
  }

  function onChallengeFilterChange(){
    const input = document.getElementById('chal-search-input');
    challengeFilters.search = input ? input.value : '';
    challengeOffset = 0;
    /* Debounced so we don't fire an API request on every keystroke. */
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      renderActiveChallengeFilters();
      loadChallengeGrid();
    }, 300);
  }

  /* Removable summary of the active filters, rendered next to the results
     heading so a filtered view is never mistaken for the whole range. */
  function renderActiveChallengeFilters(){
    const host = document.getElementById('chal-active-filters');
    if(!host) return;
    const chips = [];
    if(challengeFilters.search) chips.push({ key:'search', label:`"${challengeFilters.search}"` });
    if(challengeFilters.category !== 'all') chips.push({ key:'category', label:challengeFilters.category });
    if(challengeFilters.difficulty !== 'all') chips.push({ key:'difficulty', label:challengeFilters.difficulty });
    if(challengeFilters.solved !== 'all') chips.push({ key:'solved', label:challengeFilters.solved === 'solved' ? 'Solved' : 'Unsolved' });
    host.replaceChildren();
    if(!chips.length){
      const hint = document.createElement('span');
      hint.className = 'range-active-empty';
      hint.textContent = 'No filters applied — showing every published challenge.';
      host.appendChild(hint);
      return;
    }
    chips.forEach(chip => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'range-chip';
      button.innerHTML = `${escapeHtml(chip.label)}<span aria-hidden="true">×</span>`;
      button.setAttribute('aria-label', `Remove filter ${chip.label}`);
      button.addEventListener('click', () => {
        if(chip.key === 'search'){
          challengeFilters.search = '';
          const input = document.getElementById('chal-search-input');
          if(input) input.value = '';
        } else {
          challengeFilters[chip.key] = 'all';
        }
        setChallengeFilter(chip.key, challengeFilters[chip.key]);
      });
      host.appendChild(button);
    });
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'range-chip range-chip-clear';
    clear.textContent = 'Clear all';
    clear.addEventListener('click', resetChallengeFilters);
    host.appendChild(clear);
  }

  /* The filter rail is a real control surface, not decoration: each option
     maps straight onto a GET /api/challenges query parameter, so what the
     rail shows and what the grid returns can never disagree. */
  function buildFilterOptions(containerId, options, type){
    const container=document.getElementById(containerId);
    if(!container) return;
    container.replaceChildren();
    options.forEach(opt => {
      const value = opt === 'All' ? 'all' : opt;
      const label=document.createElement('label');
      label.className='range-filter-option';
      label.dataset.filterValue=value;
      const input=document.createElement('input');
      input.type='radio';
      input.name=`chal-filter-${type}`;
      input.value=value;
      input.addEventListener('change',()=>{ if(input.checked) setChallengeFilter(type,value); });
      const text=document.createElement('span');
      text.className='range-filter-option-label';
      text.textContent=opt === 'All' ? 'All' : opt;
      label.appendChild(input);
      label.appendChild(text);
      container.appendChild(label);
    });
  }

  function buildSolvedFilterOptions(){
    const container=document.getElementById('chal-solved-filters');
    if(!container) return;
    const options=[{value:'all',label:'All'},{value:'unsolved',label:'Unsolved'},{value:'solved',label:'Solved'}];
    container.replaceChildren();
    options.forEach(opt=>{
      const label=document.createElement('label');
      label.className='range-filter-option';
      label.dataset.filterValue=opt.value;
      const input=document.createElement('input');
      input.type='radio';
      input.name='chal-filter-solved';
      input.value=opt.value;
      input.addEventListener('change',()=>{ if(input.checked) setChallengeFilter('solved',opt.value); });
      const text=document.createElement('span');
      text.className='range-filter-option-label';
      text.textContent=opt.label;
      label.appendChild(input);
      label.appendChild(text);
      container.appendChild(label);
    });
  }

  /* Reflects `challengeFilters` onto the existing controls. Selecting a
     filter must NOT rebuild the rail: replacing the node a keyboard user is
     standing on would drop focus mid-interaction, and the option list only
     changes when the taxonomy is (re)loaded. */
  function syncChallengeFilterState(){
    const groups=[['chal-category-filters','category'],['chal-difficulty-filters','difficulty'],['chal-solved-filters','solved']];
    groups.forEach(([id,key])=>{
      const container=document.getElementById(id);
      if(!container) return;
      container.querySelectorAll('.range-filter-option').forEach(label=>{
        const active=label.dataset.filterValue===challengeFilters[key];
        label.classList.toggle('is-active',active);
        const input=label.querySelector('input');
        if(input) input.checked=active;
      });
    });
    const sort=document.getElementById('chal-sort');
    if(sort) sort.value=challengeFilters.sort;
    renderActiveChallengeFilters();
  }

  function renderChallengeFilters(){
    buildFilterOptions('chal-category-filters', categoryOptions, 'category');
    buildFilterOptions('chal-difficulty-filters', difficultyOptions, 'difficulty');
    buildSolvedFilterOptions();
    syncChallengeFilterState();
  }

  /* Loaded once per page load (cached), since categories/difficulties
     essentially never change during a session. */
  async function loadChallengeFilterOptions(){
    if(challengeFilterOptionsLoaded) return;
    try{
      const [catsRes, diffsRes] = await Promise.all([
        CyberYardHubAPI.categories.list(),
        CyberYardHubAPI.difficulties.list()
      ]);
      categoryOptions = ['All', ...catsRes.categories.map(c => c.name)];
      difficultyOptions = ['All', ...diffsRes.difficulties.map(d => d.name)];
      challengeFilterOptionsLoaded = true;
    }catch(e){
      /* Fall back to just "All" rather than blocking the page — the grid
         itself still loads (or reports its own error) independently. */
    }
  }

  /* The progress bar always reflects total site-wide progress, independent
     of whatever search/category/difficulty filters are currently active —
     matching the original mock behavior — so it's fetched unfiltered. */
  async function refreshChallengeProgress(){
    try{
      const res = await CyberYardHubAPI.challenges.list({limit:1, offset:0});
      const total = Number(res.total || 0);
      const solved = Number(res.solvedTotal || 0);
      const pct = total ? Math.round((solved / total) * 100) : 0;
      document.getElementById('chal-progress-fill').style.width = pct + '%';
      document.getElementById('chal-progress-label').textContent = `${solved} / ${total} solved (${pct}%)`;
    }catch(e){
      /* Leave the progress bar at its last-known state on failure rather
         than showing a scary error for a secondary piece of UI. */
    }
  }

  function renderChallengeCards(list){
    const grid = document.getElementById('chal-grid');
    if(list.length === 0){
      grid.innerHTML = '<div class="chal-empty">No challenges match your filters.</div>';
      return;
    }
    grid.innerHTML = list.map(c => `
      <button type="button" class="chal-card ${c.solved ? 'solved' : ''}" onclick="goToChallengeDetail(${escapeHtml(JSON.stringify(c.id))})">
        <div class="cc-top">
          <span class="cc-cat">${escapeHtml(c.category.name)}</span>
          <span class="difficulty-badge ${escapeHtml(String(c.difficulty.name || '').toLowerCase().replace(/[^a-z0-9_-]/g, ''))}">${escapeHtml(c.difficulty.name)}</span>
        </div>
        <h3>${escapeHtml(c.title)}</h3>
        <p class="cc-teaser">${escapeHtml(c.teaser || '')}</p>
        <div class="cc-bottom">
          <span class="cc-pts">${formatPoints(c.points)} pts</span>
          ${c.solved ? '<span class="cc-solved-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Solved</span>' : ''}
        </div>
      </button>
    `).join('');
  }

  function renderChallengePagination(total, limit, offset){
    const el=document.getElementById('chal-pagination'); if(!el) return;
    const page=Math.floor(offset/limit)+1; const pages=Math.max(1,Math.ceil(total/limit));
    el.innerHTML=`<button type="button" class="btn btn-ghost btn-small" ${offset<=0?'disabled':''} onclick="challengePreviousPage()">Previous</button><span class="challenge-page-label">Page ${page} / ${pages}</span><button type="button" class="btn btn-ghost btn-small" ${offset+limit>=total?'disabled':''} onclick="challengeNextPage()">Next</button>`;
  }
  function challengePreviousPage(){ challengeOffset=Math.max(0,challengeOffset-challengePageSize); loadChallengeGrid(); }
  function challengeNextPage(){ challengeOffset+=challengePageSize; loadChallengeGrid(); }

  function renderChallengeResultSummary(total, shown){
    const summary = document.getElementById('range-filter-summary');
    if(summary) summary.textContent = total
      ? `${formatPoints(total)} challenge${total === 1 ? '' : 's'} match · showing ${formatPoints(shown)}`
      : 'No challenges match the current filters.';
  }

  async function loadChallengeGrid(){
    const grid = document.getElementById('chal-grid');
    if(!grid) return;
    const mySeq = ++challengeRequestSeq;
    grid.innerHTML = '<div class="chal-empty">Loading challenges…</div>';
    try{
      const res = await CyberYardHubAPI.challenges.list({
        search: challengeFilters.search.trim(),
        category: challengeFilters.category,
        difficulty: challengeFilters.difficulty,
        solved: challengeFilters.solved,
        sort: challengeFilters.sort,
        limit: challengePageSize,
        offset: challengeOffset
      });
      if(mySeq !== challengeRequestSeq) return;
      const list = res.challenges || [];
      renderChallengeCards(list);
      renderChallengePagination(Number(res.total||0), Number(res.limit||challengePageSize), Number(res.offset||0));
      renderChallengeResultSummary(Number(res.total||0), list.length);
      renderActiveChallengeFilters();
    }catch(e){
      if(mySeq !== challengeRequestSeq) return;
      if(isUnauthorizedError(e)){ redirectToLoginFromNav('view challenges'); return; }
      grid.innerHTML = `<div class="chal-empty">${escapeHtml(e.message || 'Unable to load challenges right now.')}</div>`;
      const pagination=document.getElementById('chal-pagination'); if(pagination) pagination.innerHTML='';
      renderChallengeResultSummary(0, 0);
    }
  }

  /* ---------- protected challenges route ---------- */
  async function goToChallenges(){
    if(!guardViewRoute('challenges','view challenges')) return;
    const session = await getSession();
    if(!session){ redirectToLoginFromNav('view challenges'); return; }
    currentNav = 'challenges'; updateActiveNav();
    showView('challenges');
    window.scrollTo({top:0, behavior:'auto'});
    syncAccountSubnav(session);

    const search = document.getElementById('chal-search-input');
    if(search && search.value !== challengeFilters.search) search.value = challengeFilters.search;
    await loadChallengeFilterOptions();
    renderChallengeFilters();
    refreshChallengeProgress();
    loadChallengeGrid();
  }

  /* ---------- protected challenge detail route ---------- */
  function clearFlagAlerts(){
    ['flag-alert-info','flag-alert-success','flag-alert-error'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.classList.remove('show');
    });
  }

  function showFlagAlert(type, message){
    clearFlagAlerts();
    const el = document.getElementById('flag-alert-' + type);
    const form=document.querySelector('#view-challenge-detail .flag-form, #view-challenge-detail form');
    if(form) cyhDecorateSubmitState(form,type==='success'?'success':(type==='error'?'error':null));
    if(el){el.querySelector('.am').textContent=message;el.classList.add('show');}
  }

  async function goToChallengeDetail(id){
    if(!guardViewRoute('challenge-detail','view this challenge')) return;
    const session = await getSession();
    if(!session){ redirectToLoginFromNav('view this challenge'); return; }

    currentChallengeId = id;
    currentNav = 'challenges'; updateActiveNav();

setText('cd-title', 'Loading…');
    setText('cd-category', '');
    setText('cd-points', '');
    setText('cd-solves', '—');
    setText('cd-description', '');
    document.getElementById('cd-solved-badge').classList.add('hidden');
    document.getElementById('flag-input').value = '';
    document.getElementById('flag-form')?.classList.remove('hidden');
    setText('cd-stat-solves','—'); setText('cd-stat-attempts','—'); setText('cd-stat-unique','—'); setText('cd-stat-rate','—'); setText('cd-first-blood','—'); setText('cd-status-label','Loading');
    clearFlagAlerts();

    showView('challenge-detail');
    window.scrollTo({top:0, behavior:'smooth'});

    try{
      const res = await CyberYardHubAPI.challenges.get(id);
      if(currentChallengeId !== id) return; // navigated away before this resolved
      const chal = res.challenge;

      setText('cd-title', chal.title);
      setText('cd-category', chal.category.name);
      setText('cd-points', formatPoints(chal.points));
      setText('cd-solves', `${Number(chal.solveCount ?? 0)} solves`);
      setText('cd-description', chal.description);
      setText('cd-status-label', chal.status === 'ARCHIVED' ? 'Archived · historical access' : 'Published');
      setText('cd-stat-solves', String(chal.statistics?.totalSolves ?? chal.solveCount ?? 0));
      setText('cd-stat-attempts', String(chal.statistics?.totalAttempts ?? 0));
      setText('cd-stat-unique', String(chal.statistics?.uniqueSolvers ?? 0));
      setText('cd-stat-rate', `${Number(chal.statistics?.solveRate ?? 0)}%`);
      setText('cd-first-blood', chal.statistics?.firstBlood ? `${chal.statistics.firstBlood.username} · ${formatDateTime(chal.statistics.firstBlood.solvedAt)}` : 'Not claimed yet');

      const diffEl = document.getElementById('cd-difficulty');
      diffEl.textContent = chal.difficulty.name;
      diffEl.className = 'difficulty-badge ' + String(chal.difficulty?.name || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');

      document.getElementById('cd-solved-badge').classList.toggle('hidden', !chal.solved);
      const flagForm=document.getElementById('flag-form'); const flagInput=document.getElementById('flag-input'); const submitBtn=flagForm?.querySelector('button[type="submit"]');
      const archived=chal.status === 'ARCHIVED';
      if(flagForm) flagForm.classList.toggle('hidden', archived);
      if(archived) setText('cd-status-label','Archived · submissions closed');
      loadChallengeExtras();
    }catch(e){
      if(currentChallengeId !== id) return;
      if(isUnauthorizedError(e)){ redirectToLoginFromNav('view this challenge'); return; }
      setText('cd-title', 'Challenge not found');
      setText('cd-description', e.message || 'Unable to load this challenge right now.');
    }
  }

  async function loadChallengeExtras(){
    const challengeId = currentChallengeId;
    if(!challengeId) return;
    const hintsEl = document.getElementById('cd-hints-list');
    const filesEl = document.getElementById('cd-files-list');
    const writeupEl = document.getElementById('cd-writeup-content');
    const writeupStatus = document.getElementById('cd-writeup-status');
    const balanceEl = document.getElementById('cd-hints-balance');
    if(hintsEl) hintsEl.textContent = 'Loading hints…';
    if(filesEl) filesEl.textContent = 'Loading files…';
    if(writeupEl) writeupEl.textContent = 'Loading writeup…';
    try{
      const [hints, files] = await Promise.all([
        CyberYardHubAPI.challengeExtras.hints.list(challengeId),
        CyberYardHubAPI.challengeExtras.files.list(challengeId)
      ]);
      if(currentChallengeId !== challengeId) return;
      const hintList = hints.hints || [];
      if(balanceEl) balanceEl.textContent = `${formatPoints(hints.availablePoints || 0)} points available for hints`;
      if(hintsEl){
        hintsEl.innerHTML = hintList.length ? hintList.map(h => `
          <div class="challenge-extra-row">
            <div class="challenge-extra-main">
              <div class="challenge-extra-title">${escapeHtml(h.title)}</div>
              <div class="challenge-extra-meta">${h.unlocked ? 'Unlocked' : `${formatPoints(h.cost)} points to unlock`}</div>
            </div>
            ${h.unlocked ? '<span class="p-tag accent">Unlocked</span>' : `<button type="button" class="btn btn-ghost btn-small" onclick="unlockChallengeHint(${escapeHtml(JSON.stringify(h.id))})">Unlock</button>`}
          </div>
          ${h.unlocked && h.content ? `<div class="challenge-extra-content">${escapeHtml(h.content)}</div>` : ''}
        `).join('') : '<div class="challenge-extra-empty">No hints are available for this challenge.</div>';
      }
      if(currentChallengeId !== challengeId) return;
      const fileList = files.files || [];
      if(filesEl){
        filesEl.innerHTML = fileList.length ? fileList.map(f => `
          <div class="challenge-extra-row">
            <div class="challenge-extra-main">
              <div class="challenge-extra-title">${escapeHtml(f.originalName)}</div>
              <div class="challenge-extra-meta">${escapeHtml(f.mimeType)} · ${formatFileSize(f.sizeBytes)}</div>
            </div>
            <a class="btn btn-ghost btn-small" href="${escapeHtml(CyberYardHubAPI.challengeExtras.files.downloadUrl(challengeId, f.id))}">Download</a>
          </div>`).join('') : '<div class="challenge-extra-empty">No challenge files are available.</div>';
      }
    }catch(e){
      if(hintsEl) hintsEl.innerHTML = '<div class="challenge-extra-empty">Unable to load hints right now.</div>';
      if(filesEl) filesEl.innerHTML = '<div class="challenge-extra-empty">Unable to load challenge files right now.</div>';
    }
    try{
      const response = await CyberYardHubAPI.challengeExtras.writeup.get(challengeId);
      if(currentChallengeId !== challengeId) return;
      if(writeupEl) writeupEl.textContent = response.writeup?.content || 'No writeup content is available.';
      if(writeupStatus) writeupStatus.textContent = 'Published after solve';
    }catch(e){
      if(writeupEl) writeupEl.textContent = e.status === 403 ? 'Solve this challenge to access its published writeup.' : 'No published writeup is available.';
      if(writeupStatus) writeupStatus.textContent = e.status === 403 ? 'Locked until solved' : 'Not available';
    }
  }

  function formatDateTime(value){ try{return new Date(value).toLocaleString([], {dateStyle:'medium', timeStyle:'short'});}catch(_){return 'Unknown time';} }

  function formatFileSize(bytes){
    const n = Number(bytes) || 0;
    if(n < 1024) return `${n} B`;
    if(n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function unlockChallengeHint(hintId){
    try{
      const result = await CyberYardHubAPI.challengeExtras.hints.unlock(currentChallengeId, hintId);
      await loadChallengeExtras();
      if(result.remainingPoints !== undefined){
        const balance = document.getElementById('cd-hints-balance');
        if(balance) balance.textContent = `${formatPoints(result.remainingPoints)} points available for hints`;
      }
    }catch(e){
      showFlagAlert('error', e.message || 'Unable to unlock this hint right now.');
    }
  }

  /* Flag submission now POSTs to the real backend
     (POST /api/challenges/:id/submit), which verifies the submitted value
     against a server-side hashed flag — the real flag is never sent to,
     stored in, or expected by this file. The server's response
     ({ correct, alreadySolved, pointsAwarded }) drives the UI directly. */
  async function handleFlagSubmit(evt){
    evt.preventDefault();
    if(!currentChallengeId) return;

    const input = document.getElementById('flag-input');
    const value = input.value.trim();
    if(!value){
      showFlagAlert('error', 'Enter a flag before submitting.');
      return;
    }

    /* Instant local feedback for the common case (badge already visible
       from the detail load) without a network round trip — the server's
       own alreadySolved check below still runs as the source of truth. */
    const alreadySolvedLocally = !document.getElementById('cd-solved-badge').classList.contains('hidden');
    if(alreadySolvedLocally){
      showFlagAlert('info', "You've already solved this challenge.");
      return;
    }

    const btn = evt.target.querySelector('button[type="submit"]');
    cyhDecorateSubmitState(evt.target,'loading');
    btn.disabled = true; input.disabled = true; btn.textContent = 'Verifying…';

    try{
      const result = await CyberYardHubAPI.challenges.submit(currentChallengeId, value);
      if(result.alreadySolved){
        document.getElementById('cd-solved-badge').classList.remove('hidden');
        showFlagAlert('info', "You've already solved this challenge.");
      } else if(result.correct){
        document.getElementById('cd-solved-badge').classList.remove('hidden');
        input.value = '';
        showFlagAlert('success', result.firstBlood ? `Correct! +${formatPoints(result.pointsAwarded)} points · +${formatPoints(result.xpAwarded || 0)} XP · First Blood.` : `Correct! +${formatPoints(result.pointsAwarded)} points · +${formatPoints(result.xpAwarded || 0)} XP.`);
        refreshChallengeProgress();
        loadChallengeExtras();
        refreshHomeLiveStats();
      } else {
        showFlagAlert('error', 'Incorrect flag. Give it another try.');
      }
    }catch(e){
      if(isUnauthorizedError(e)){
        redirectToLoginFromNav('submit a flag');
        return;
      }
      if(e.status === 429){
        showFlagAlert('error', e.message || 'Too many attempts — please wait a moment and try again.');
      } else if(e.status === 400){
        showFlagAlert('error', firstZodMessage(e.issues) || 'Enter a flag before submitting.');
      } else if(e.status === 404){
        showFlagAlert('error', 'This challenge could not be found.');
      } else {
        showFlagAlert('error', e.message || 'Unable to submit your flag right now. Please try again.');
      }
    }finally{
      btn.disabled = false; input.disabled = false; btn.textContent = 'Submit Flag';
    }
  }

  /* ---------- teams (defensive forward-compatible surface) ---------- */
  let currentTeam = null;
  let teamRequestSeq = 0;
  let teamsApiAvailable = true;

  function setTeamsStatus(type, message){
    const alert = document.getElementById('teams-status-alert');
    if(!alert) return;
    alert.className = 'alert alert-' + (type === 'error' ? 'error' : type === 'success' ? 'success' : 'info') + ' teams-status-alert show';
    const copy = alert.querySelector('.am');
    if(copy) copy.textContent = message;
  }
  function clearTeamsStatus(){
    const alert = document.getElementById('teams-status-alert');
    if(!alert) return;
    alert.classList.remove('show');
    const copy = alert.querySelector('.am');
    if(copy) copy.textContent = '';
  }
  function setTeamsControlsDisabled(disabled){
    ['create-team-name','join-team-code'].forEach(id => { const el=document.getElementById(id); if(el) el.disabled=disabled; });
    document.querySelectorAll('#create-team-form button, #join-team-form button').forEach(button => { button.disabled=disabled; });
  }
  function markTeamsUnavailable(error){
    teamsApiAvailable = false;
    console.warn('CyberYardHub teams API unavailable; team affordances disabled.', error);
    setTeamsControlsDisabled(true);
    setTeamsStatus('error', 'Team services are not available in this deployment. Solo play remains ready.');
  }
  function handleTeamsMutationError(error, fallback){
    const businessNotFound = error?.status === 404 && ['NOT_IN_TEAM','TEAM_NOT_FOUND'].includes(error.code);
    if((error?.status === 404 && !businessNotFound) || error?.isNetworkError || (error?.status >= 500)){
      markTeamsUnavailable(error);
      return;
    }
    setTeamsStatus('error', error?.message || fallback);
  }
  function renderTeamMembers(team){
    const list = document.getElementById('team-members-list');
    if(!list) return;
    const members = Array.isArray(team?.members) ? team.members : [];
    list.innerHTML = members.length ? members.map(member => {
      const username = member.username || 'operator';
      const role = String(member.role || 'MEMBER').toUpperCase().replace(/[^A-Z_]/g, '') || 'MEMBER';
      const initial = escapeHtml(username.charAt(0).toUpperCase());
      const joined = member.joinedAt ? escapeHtml(eventDate(member.joinedAt)) : 'Joined';
      return `<div class="team-member-row"><span class="team-member-avatar" aria-hidden="true">${initial}</span><div class="team-member-main"><strong>${escapeHtml(username)}</strong><small>${joined}</small></div><span class="team-role-badge role-${role.toLowerCase()}">${escapeHtml(role)}</span></div>`;
    }).join('') : '<div class="challenge-extra-empty">No members are listed yet.</div>';
    const caption = document.getElementById('teams-members-caption');
    if(caption) caption.textContent = `${members.length} / 6 seats`;
  }
  function renderTeam(team){
    currentTeam = team || null;
    setTeamsControlsDisabled(!!currentTeam || !teamsApiAvailable);
    const empty = document.getElementById('teams-empty-state');
    const content = document.getElementById('teams-my-content');
    if(empty) empty.hidden = !!currentTeam;
    if(content) content.hidden = !currentTeam;
    if(!currentTeam){
      setText('teams-member-count', '—');
      renderTeamMembers(null);
      return;
    }
    setText('teams-member-count', `${Number(currentTeam.memberCount ?? currentTeam.members?.length ?? 0)} / 6`);
    setText('team-name', currentTeam.name || 'Unnamed team');
    setText('team-slug', currentTeam.slug ? `@${currentTeam.slug}` : 'Local team');
    setText('team-score', formatPoints(currentTeam.score || 0));
    setText('team-rank', currentTeam.rank == null ? '—' : String(currentTeam.rank));
    const captain = !!currentUser && (currentUser.id === currentTeam.captainId || currentTeam.members?.some(member => member.userId === currentUser.id && String(member.role).toUpperCase() === 'CAPTAIN'));
    const code = currentTeam.inviteCode || '';
    setText('team-invite-code', code || 'Ask your captain');
    setText('team-invite-help', captain ? 'Share this rotating code with trusted teammates.' : 'Only the captain can see or rotate the invite code.');
    const copy = document.getElementById('copy-team-invite');
    if(copy){ copy.disabled = !code; copy.textContent = code ? 'Copy code' : 'Captain only'; }
    const rotate = document.querySelector('#teams-my-content .team-actions .btn-ghost');
    if(rotate){ rotate.disabled = !captain; rotate.title = captain ? 'Rotate the invite code' : 'Only the captain can rotate it'; }
    renderTeamMembers(currentTeam);
  }
  async function loadMyTeam(){
    if(!teamsApiAvailable) return null;
    const seq = ++teamRequestSeq;
    const root = document.getElementById('teams-my-content');
    if(root) root.setAttribute('aria-busy','true');
    try{
      const response = await teams.mine();
      if(seq !== teamRequestSeq) return null;
      teamsApiAvailable = true;
      setTeamsControlsDisabled(false);
      renderTeam(response.team || null);
      return response.team || null;
    }catch(error){
      if(seq !== teamRequestSeq) return null;
      if(error?.status === 404 && error.code === 'NOT_IN_TEAM'){
        teamsApiAvailable = true;
        setTeamsControlsDisabled(false);
        renderTeam(null);
        return null;
      }
      if(error?.status === 401){ teamsApiAvailable = false; currentUser = null; redirectToLoginFromNav('use the teams hub'); return null; }
      markTeamsUnavailable(error);
      renderTeam(null);
      return null;
    }finally{
      if(root && seq === teamRequestSeq) root.removeAttribute('aria-busy');
    }
  }
  /* Team standings live on the Scoreboard (Teams tab) — one board, one place
     to read it. The teams hub is about your own crew, so it stays focused on
     membership, invites and captaincy. */
  async function goToTeams(){
    if(!guardViewRoute('teams','use the teams hub')) return;
    const session = await getSession();
    if(!session){ redirectToLoginFromNav('use the teams hub'); return; }
    currentNav = 'teams'; updateActiveNav();
    teamsApiAvailable = true;
    setTeamsControlsDisabled(false);
    showView('teams');
    window.scrollTo({top:0, behavior:'auto'});
    syncAccountSubnav(session);
    clearTeamsStatus();
    await loadMyTeam();
  }
  async function createCurrentTeam(event){
    event.preventDefault();
    if(!teamsApiAvailable) return;
    const name = document.getElementById('create-team-name')?.value.trim() || '';
    if(name.length < 3){ setTeamsStatus('error','Use a team name with at least three characters.'); return; }
    const button = event.target.querySelector('button[type="submit"]');
    if(button) button.disabled = true;
    try{
      const response = await teams.create({name});
      renderTeam(response.team);
      event.target.reset();
      setTeamsStatus('success','Team created. Share the invite code with trusted teammates.');
    }catch(error){ handleTeamsMutationError(error, 'Unable to create the team.'); }
    finally{ if(button) button.disabled = !teamsApiAvailable; }
  }
  async function joinCurrentTeam(event){
    event.preventDefault();
    if(!teamsApiAvailable) return;
    const inviteCode = document.getElementById('join-team-code')?.value.trim().toUpperCase() || '';
    if(inviteCode.length < 6){ setTeamsStatus('error','Enter the invite code supplied by your captain.'); return; }
    const button = event.target.querySelector('button[type="submit"]');
    if(button) button.disabled = true;
    try{
      const response = await teams.join({inviteCode});
      renderTeam(response.team);
      event.target.reset();
      setTeamsStatus('success',`Welcome to ${response.team?.name || 'your new team'}.`);
    }catch(error){ handleTeamsMutationError(error, 'Unable to join that team.'); }
    finally{ if(button) button.disabled = !teamsApiAvailable; }
  }
  async function copyTeamInviteCode(){
    const code = currentTeam?.inviteCode;
    if(!code){ setTeamsStatus('error','Only the captain can copy the invite code.'); return; }
    try{
      if(navigator.clipboard?.writeText) await navigator.clipboard.writeText(code);
      else {
        const helper = document.createElement('textarea'); helper.value = code; helper.setAttribute('readonly',''); helper.style.position='fixed'; helper.style.opacity='0'; document.body.appendChild(helper); helper.select(); document.execCommand('copy'); helper.remove();
      }
      setTeamsStatus('success','Invite code copied.');
    }catch(_){ setTeamsStatus('error','Copy was blocked by the browser. Select the code manually.'); }
  }
  async function regenerateTeamInvite(){
    if(!currentTeam?.inviteCode) return;
    if(!confirm('Rotate the team invite code? The previous code will stop working.')) return;
    try{
      const response = await teams.regenerateCode();
      currentTeam.inviteCode = response.inviteCode;
      renderTeam(currentTeam);
      setTeamsStatus('success','A new invite code is ready.');
    }catch(error){ handleTeamsMutationError(error, 'Unable to rotate the invite code.'); }
  }
  async function leaveCurrentTeam(){
    if(!currentTeam) return;
    if(!confirm('Leave this team? Captains with other members must transfer leadership first.')) return;
    try{
      const response = await teams.leave();
      renderTeam(null);
      setTeamsStatus('success', response?.dissolved ? 'Team dissolved.' : 'You left the team.');
    }catch(error){ handleTeamsMutationError(error, 'Unable to leave the team.'); }
  }

  /* ---------- quick flag submit ---------- */
  let quickSelectedChallenge = null;
  let quickChallenges = [];
  let quickChallengeSeq = 0;
  let quickSearchTimer = null;
  function setQuickResult(type, message){
    const result = document.getElementById('quick-submit-result');
    if(!result) return;
    result.className = 'quick-result quick-result-' + type;
    result.textContent = message;
    result.hidden = false;
  }
  function populateQuickSubmitFilters(){
    const category = document.getElementById('quick-category');
    const difficulty = document.getElementById('quick-difficulty');
    if(category){
      category.replaceChildren();
      categoryOptions.forEach(value => { const option=document.createElement('option'); option.value=value==='All'?'all':value; option.textContent=value==='All'?'All categories':value; category.appendChild(option); });
    }
    if(difficulty){
      difficulty.replaceChildren();
      difficultyOptions.forEach(value => { const option=document.createElement('option'); option.value=value==='All'?'all':value; option.textContent=value==='All'?'All difficulties':value; difficulty.appendChild(option); });
    }
  }
  async function loadQuickSubmitFilterOptions(){
    await loadChallengeFilterOptions();
    populateQuickSubmitFilters();
  }
  function onQuickChallengeSearch(){
    clearTimeout(quickSearchTimer);
    quickSearchTimer = setTimeout(loadQuickSubmitChallenges, 280);
  }
  async function loadQuickSubmitChallenges(){
    const select = document.getElementById('quick-challenge-select');
    if(!select) return;
    const seq = ++quickChallengeSeq;
    select.disabled = true;
    try{
      const response = await CyberYardHubAPI.challenges.list({
        search: document.getElementById('quick-challenge-search')?.value.trim() || undefined,
        category: document.getElementById('quick-category')?.value || 'all',
        difficulty: document.getElementById('quick-difficulty')?.value || 'all',
        limit: 50,
        offset: 0
      });
      if(seq !== quickChallengeSeq) return;
      quickChallenges = Array.isArray(response.challenges) ? response.challenges : [];
      select.replaceChildren();
      const placeholder = document.createElement('option'); placeholder.value=''; placeholder.textContent=quickChallenges.length ? 'Select a challenge' : 'No challenges match these filters'; select.appendChild(placeholder);
      quickChallenges.forEach(challenge => { const option=document.createElement('option'); option.value=challenge.id; option.textContent=`${challenge.title} · ${formatPoints(challenge.points)} pts`; select.appendChild(option); });
      quickSelectedChallenge = null;
      const preview = document.getElementById('quick-challenge-preview');
      if(preview) preview.innerHTML='<div class="challenge-extra-empty">Select a challenge to see its mode and detail link.</div>';
    }catch(error){
      if(seq !== quickChallengeSeq) return;
      if(isUnauthorizedError(error)){ redirectToLoginFromNav('submit a flag'); return; }
      select.replaceChildren();
      const option=document.createElement('option'); option.value=''; option.textContent='Unable to load challenges'; select.appendChild(option);
      setQuickResult('error', error.message || 'Unable to load challenges right now.');
    }finally{ if(seq === quickChallengeSeq) select.disabled = false; }
  }
  async function selectQuickChallenge(id){
    const preview = document.getElementById('quick-challenge-preview');
    if(!id){ quickSelectedChallenge=null; if(preview) preview.innerHTML='<div class="challenge-extra-empty">Select a challenge to see its mode and detail link.</div>'; return; }
    const summary = quickChallenges.find(challenge => String(challenge.id) === String(id));
    if(!summary) return;
    const seq = ++quickChallengeSeq;
    quickSelectedChallenge = {...summary, locked:false, dynamicFlagMode:false};
    if(preview) preview.innerHTML=`<div class="quick-preview-loading">Loading challenge mode…</div>`;
    try{
      const response = await CyberYardHubAPI.challenges.get(id);
      if(seq !== quickChallengeSeq || document.getElementById('quick-challenge-select')?.value !== id) return;
      const challenge = response.challenge || {};
      const dynamicFlagMode = challenge.flagMode === 'DYNAMIC' || typeof challenge.dynamicFlag === 'string' || summary.flagMode === 'DYNAMIC';
      const safeChallenge = {...challenge};
      delete safeChallenge.dynamicFlag;
      quickSelectedChallenge = {...summary, ...safeChallenge, dynamicFlagMode};
      const modeText = dynamicFlagMode ? 'Your flag is personalized for this account.' : 'This challenge uses the standard static flag.';
      const scoreText = challenge.scoringMode === 'DYNAMIC' ? 'Dynamic scoring decays as more operators solve it.' : 'Static scoring awards the published point value.';
      if(preview) preview.innerHTML=`<div class="quick-preview-head"><div><div class="panel-kicker">SELECTED CHALLENGE</div><strong>${escapeHtml(challenge.title || summary.title || 'Challenge')}</strong><span>${escapeHtml(challenge.category?.name || summary.category?.name || '')} · ${escapeHtml(challenge.difficulty?.name || summary.difficulty?.name || '')} · ${escapeHtml(formatPoints(challenge.points ?? summary.points ?? 0))} pts</span></div><button class="btn btn-ghost btn-small" type="button" onclick="goToChallengeDetail(${escapeHtml(JSON.stringify(id))})">Open detail <span>↗</span></button></div><div class="quick-preview-notes"><span>${escapeHtml(modeText)}</span><span>${escapeHtml(scoreText)}</span>${challenge.locked?'<span class="quick-preview-locked">Locked: solve the prerequisite before submitting.</span>':''}</div>`;
      const submit = document.getElementById('quick-flag-submit');
      const input = document.getElementById('quick-flag-input');
      if(submit) submit.disabled = !!challenge.locked;
      if(input) input.disabled = !!challenge.locked;
    }catch(error){
      if(seq !== quickChallengeSeq) return;
      if(isUnauthorizedError(error)){ redirectToLoginFromNav('submit a flag'); return; }
      if(preview) preview.innerHTML=`<div class="challenge-extra-empty">${escapeHtml(error.message || 'Unable to load this challenge.')}</div>`;
    }
  }
  async function handleQuickFlagSubmit(event){
    event.preventDefault();
    const challengeId = quickSelectedChallenge?.id;
    const input = document.getElementById('quick-flag-input');
    const value = input?.value.trim() || '';
    if(!challengeId){ setQuickResult('error','Select a challenge first.'); return; }
    if(quickSelectedChallenge.locked){ setQuickResult('locked','This challenge is locked until its prerequisite is solved.'); return; }
    if(!value){ setQuickResult('error','Enter a flag before submitting.'); return; }
    const button = event.target.querySelector('button[type="submit"]');
    if(button){ button.disabled=true; button.textContent='Verifying…'; }
    if(input) input.disabled=true;
    cyhDecorateSubmitState(event.target,'loading');
    try{
      const result = await CyberYardHubAPI.challenges.submit(challengeId, value);
      if(result.alreadySolved){ setQuickResult('info','You already solved this challenge.'); }
      else if(result.correct){
        input.value='';
        setQuickResult('success', result.firstBlood ? `Correct! +${formatPoints(result.pointsAwarded)} points · First Blood.` : `Correct! +${formatPoints(result.pointsAwarded)} points.`);
        void refreshHomeLiveStats();
      }else setQuickResult('error','Incorrect flag. Give it another try.');
    }catch(error){
      if(isUnauthorizedError(error)){ redirectToLoginFromNav('submit a flag'); return; }
      if(error.status === 429) setQuickResult('rate-limited', error.message || 'Too many attempts — wait a moment and try again.');
      else if(error.status === 403) setQuickResult('locked', error.message || 'This challenge is currently locked.');
      else if(error.status === 404) setQuickResult('error','This challenge could not be found.');
      else setQuickResult('error', error.message || 'Unable to submit your flag right now.');
    }finally{
      if(button){ button.disabled=!!quickSelectedChallenge?.locked; button.textContent='Submit Flag'; }
      if(input) input.disabled=!!quickSelectedChallenge?.locked;
    }
  }
  async function goToSubmitFlag(){
    if(!guardViewRoute('submit-flag','submit a flag')) return;
    const session = await getSession();
    if(!session){ redirectToLoginFromNav('submit a flag'); return; }
    currentNav='submit-flag'; updateActiveNav();
    showView('submit-flag');
    window.scrollTo({top:0, behavior:'auto'});
    quickSelectedChallenge=null;
    const result=document.getElementById('quick-submit-result'); if(result){ result.hidden=true; result.textContent=''; }
    await loadQuickSubmitFilterOptions();
    await loadQuickSubmitChallenges();
  }

  /* ---------- settings (protected) ---------- */
  const DEFAULT_USER_SETTINGS = { theme: 'default' };

  function normalizeUserSettings(raw){
    const base = { theme: DEFAULT_USER_SETTINGS.theme };
    if(!raw || typeof raw !== 'object') return base;
    if(raw.theme === 'dim' || raw.theme === 'default') base.theme = raw.theme;
    return base;
  }

  async function getUserSettings(email){
    try{
      const res = await appStorage.get(settingsStorageKey(email));
      if(!res || res.value == null) return normalizeUserSettings(null);
      return normalizeUserSettings(JSON.parse(res.value));
    }catch(e){
      return normalizeUserSettings(null);
    }
  }

  async function saveUserSettings(email, settings){
    await appStorage.set(settingsStorageKey(email), JSON.stringify(normalizeUserSettings(settings)));
  }

  /* Privacy: never store the raw email in a localStorage key (readable by
     any script with storage access). Hash it into an opaque per-account id. */
  function settingsStorageKey(email){
    const input = String(email || '').toLowerCase();
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for(let i=0;i<input.length;i++){
      const c = input.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 + c + i, 2654435761) >>> 0;
    }
    return 'settings:' + h1.toString(16).padStart(8,'0') + h2.toString(16).padStart(8,'0') + '_' + input.length;
  }

  function applyTheme(theme){
    document.body.dataset.theme = theme === 'dim' ? 'dim' : 'default';
  }

  function renderThemePills(theme){
    document.querySelectorAll('#settings-theme-pills [data-theme-value]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.themeValue === theme);
    });
  }

  function showSettingsFlash(id, message){
    const el = document.getElementById(id);
    if(!el) return;
    el.querySelector('.am').textContent = message;
    el.classList.add('show');
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  async function applySessionPreferences(session){
    if(!session){
      applyTheme('default');
      return;
    }
    const settings = await getUserSettings(session.email);
    applyTheme(settings.theme);
  }

  async function renderSettingsPage(session){
    setText('settings-username', session.username);
    setText('settings-email', session.email);

    const user = await getSession();
    if(user && user.createdAt){
      const d = new Date(user.createdAt);
      setText('settings-since', d.toLocaleDateString(undefined, {month:'long', day:'numeric', year:'numeric'}));
    } else {
      setText('settings-since', '—');
    }

    const settings = await getUserSettings(session.email);
    applyTheme(settings.theme);
    renderThemePills(settings.theme);

    const verified = !!session.emailVerified;
    const status = document.getElementById('settings-verification-status');
    const help = document.getElementById('settings-verification-help');
    const resend = document.getElementById('settings-resend-verification');
    const accountStatus = document.getElementById('settings-account-status');
    if(status){ status.textContent = verified ? 'Verified' : 'Unverified'; status.classList.toggle('accent', verified); }
    if(help) help.textContent = verified ? 'Your email is verified and can be used for account recovery.' : 'Verify your email to keep your account recovery channel current.';
    if(resend) resend.classList.toggle('hidden', verified);
    if(accountStatus) accountStatus.textContent = verified ? 'Active · verified' : 'Active · email unverified';

    clearAlerts('settings-pw');
    const themeSuccess = document.getElementById('settings-theme-alert-success');
    if(themeSuccess) themeSuccess.classList.remove('show');

    const pwForm = document.getElementById('settings-pw-form');
    if(pwForm) pwForm.reset();
    ['settings-pw-current-field','settings-pw-new-field','settings-pw-confirm-field'].forEach(id => setFieldError(id, false));
    await loadSecuritySessions();

  }

  async function goToSettings(){
    if(!guardViewRoute('settings','open settings')) return;
    const session = await getSession();
    if(!session){ redirectToLoginFromNav('open settings'); return; }
    currentNav = 'settings'; updateActiveNav();
    showView('settings');
    window.scrollTo({top:0, behavior:'auto'});
    await renderSettingsPage(session);
  }

  async function setThemePreference(theme){
    const session = await getSession();
    if(!session){ redirectToLoginFromNav('open settings'); return; }
    const next = theme === 'dim' ? 'dim' : 'default';
    try{
      const settings = await getUserSettings(session.email);
      settings.theme = next;
      await saveUserSettings(session.email, settings);
      applyTheme(next);
      renderThemePills(next);
      showSettingsFlash('settings-theme-alert-success', 'Appearance preference saved on this device.');
    }catch(e){
      showAlert('settings-pw', 'error', 'Unable to save appearance preference.');
    }
  }

  async function handleChangePassword(evt){
    evt.preventDefault();
    clearAlerts('settings-pw');
    const session = await getSession();
    if(!session){ redirectToLoginFromNav('open settings'); return; }

    const current = document.getElementById('settings-pw-current').value;
    const next = document.getElementById('settings-pw-new').value;
    const confirm = document.getElementById('settings-pw-confirm').value;

    let valid = true;
    const strongEnough = next.length >= 8 && /[A-Za-z]/.test(next) && /[0-9]/.test(next);
    setFieldError('settings-pw-current-field', current.length === 0); if(current.length === 0) valid = false;
    setFieldError('settings-pw-new-field', !strongEnough); if(!strongEnough) valid = false;
    const matchOk = next === confirm && confirm.length > 0;
    setFieldError('settings-pw-confirm-field', !matchOk); if(!matchOk) valid = false;
    if(!valid) return;

    const submitBtn = evt.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true; submitBtn.textContent = 'Updating…';
    try{
      await CyberYardHubAPI.auth.changePassword({ currentPassword: current, newPassword: next });
      showAlert('settings-pw', 'success', 'Password changed. Other active sessions have been signed out.');
      evt.target.reset();
      await loadSecuritySessions();
    }catch(e){
      if(e.status === 401) showAlert('settings-pw', 'error', e.code === 'INVALID_CURRENT_PASSWORD' ? 'Current password is incorrect.' : 'Your session is no longer valid. Please log in again.');
      else if(e.status === 429) showAlert('settings-pw', 'error', 'Too many password-change attempts. Please try again later.');
      else if(e.status === 400) showAlert('settings-pw', 'error', firstZodMessage(e.issues) || 'Please check the new password.');
      else showAlert('settings-pw', 'error', e.message || 'Unable to change your password right now.');
    }finally{
      submitBtn.disabled = false; submitBtn.textContent = 'Update password';
    }
  }

  function sessionBrowserLabel(userAgent){
    const ua=String(userAgent||'');
    let browser='Unknown browser';
    if(/Edg\//i.test(ua)) browser='Microsoft Edge';
    else if(/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser='Chrome';
    else if(/Firefox\//i.test(ua)) browser='Firefox';
    else if(/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser='Safari';
    else if(/curl\//i.test(ua)) browser='curl';
    let device='Unknown device';
    if(/iPhone|iPad|iPod/i.test(ua)) device='iOS device';
    else if(/Android/i.test(ua)) device='Android device';
    else if(/Windows/i.test(ua)) device='Windows device';
    else if(/Mac OS X/i.test(ua)) device='macOS device';
    else if(/Linux/i.test(ua)) device='Linux device';
    return `${browser} · ${device}`;
  }

  function formatSecurityDate(value){
    if(!value) return '—';
    const d=new Date(value);
    if(Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
  }

  function renderSecuritySessions(sessions){
    const root=document.getElementById('settings-sessions-list');
    if(!root) return;
    if(!sessions || sessions.length===0){ root.innerHTML='<div class="security-session-empty">No active sessions found.</div>'; return; }
    root.innerHTML=sessions.map(session=>`<div class="security-session-row ${session.current?'is-current':''}">
      <div class="security-session-main">
        <div class="security-session-title">${escapeHtml(sessionBrowserLabel(session.userAgent))} ${session.current?'<span class="p-tag accent">Current</span>':''}</div>
        <div class="security-session-meta">Signed in ${escapeHtml(formatSecurityDate(session.createdAt))} · Last activity ${escapeHtml(formatSecurityDate(session.lastActivityAt))}</div>
      </div>
      ${session.current?'':`<button type="button" class="btn btn-danger btn-small" onclick="revokeSecuritySession(${escapeHtml(JSON.stringify(session.id))})">Revoke</button>`}
    </div>`).join('');
  }

  async function loadSecuritySessions(){
    const root=document.getElementById('settings-sessions-list');
    if(root) root.innerHTML='<div class="security-session-empty">Loading sessions…</div>';
    try{
      const response=await CyberYardHubAPI.auth.sessions();
      renderSecuritySessions(response.sessions || []);
    }catch(e){
      if(isUnauthorizedError(e)){ currentUser=null; redirectToLoginFromNav('manage your sessions'); return; }
      if(root) root.innerHTML=`<div class="security-session-empty">${escapeHtml(e.message || 'Unable to load sessions.')}</div>`;
    }
  }

  async function revokeSecuritySession(id){
    try{
      await CyberYardHubAPI.auth.revokeSession(id);
      await loadSecuritySessions();
      if(window.cyhNotify) window.cyhNotify('Session revoked.', 'success');
    }catch(e){ if(window.cyhNotify) window.cyhNotify(e.message || 'Unable to revoke session.', 'error'); }
  }

  async function revokeAllOtherSessions(){
    try{
      const result=await CyberYardHubAPI.auth.revokeOtherSessions();
      await loadSecuritySessions();
      if(window.cyhNotify) window.cyhNotify(`${result.revoked || 0} other session${result.revoked === 1 ? '' : 's'} revoked.`, 'success');
    }catch(e){ if(window.cyhNotify) window.cyhNotify(e.message || 'Unable to revoke sessions.', 'error'); }
  }

  async function resendVerificationEmail(){
    const button=document.getElementById('settings-resend-verification');
    if(button) { button.disabled=true; button.textContent='Sending…'; }
    try{
      const result=await CyberYardHubAPI.auth.resendVerification();
      if(window.cyhNotify) window.cyhNotify(result.message || 'If needed, a verification email has been sent.', 'success');
    }catch(e){ if(window.cyhNotify) window.cyhNotify(e.message || 'Unable to resend verification email.', 'error'); }
    finally{ if(button){button.disabled=false;button.textContent='Resend verification email';} }
  }

  async function handleVerificationRoute(token){
    showView('verify-email');
    clearAlerts('verify');
    const sub=document.getElementById('verify-email-sub');
    if(!token){ if(sub) sub.textContent='No verification token was provided.'; showAlert('verify','error','This verification link is missing or has expired.'); return; }
    if(sub) sub.textContent='Verifying your email securely…';
    try{
      const result=await CyberYardHubAPI.auth.verifyEmail({token});
      if(sub) sub.textContent='Your email address is now verified.';
      showAlert('verify','success',result.message || 'Email verified successfully.');
      await refreshCurrentUser();
      await refreshNavState();
    }catch(e){
      if(sub) sub.textContent='We could not verify this link.';
      showAlert('verify','error',e.message || 'This verification link is invalid or has expired.');
    }
  }

  /* Deep link for the one email-link flow that remains: email verification.
     Password recovery was removed from the platform, so there is no reset
     branch here and no token is ever accepted without a matching view. */
  function handleAuthHashRoute(){
    const raw=window.location.hash || '';
    const match=raw.match(/^#(verify-email)\?token=([^&]+)$/i);
    if(!match) return false;
    let token=null;
    try{ token=decodeURIComponent(match[2]); }catch(e){ token=null; }
    history.replaceState(null, document.title, window.location.pathname + window.location.search);
    void handleVerificationRoute(token);
    window.scrollTo({top:0,behavior:'auto'});
    return true;
  }


  async function startHacking(){
    const session = await getSession();
    session ? goToDashboard() : goTo('signup');
  }

  /* ---------- optional realtime stream (non-blocking; GET /api/realtime/stream) ---------- */
  let realtimeSource = null;
  let realtimeUnavailable = false;
  function stopRealtimeStream(){
    if(realtimeSource){ try{ realtimeSource.close(); }catch(_){ /* already closed */ } }
    realtimeSource = null;
  }
  function connectRealtimeStream(session){
    stopRealtimeStream();
    if(!session || realtimeUnavailable || typeof EventSource === 'undefined') return;
    try{
      const source = new EventSource(cyhApiBase + '/realtime/stream', {withCredentials:true});
      realtimeSource = source;
      source.addEventListener('leaderboard_update', () => {
        if(activeViewName === 'leaderboard') void goToLeaderboard();
        if(activeViewName === 'landing') void refreshHomeLiveStats();
      });
      source.addEventListener('team_score_update', () => { if(activeViewName === 'teams') void loadMyTeam(); });
      source.addEventListener('challenge_solved', () => {
        if(activeViewName === 'challenges') void refreshChallengeProgress();
        if(activeViewName === 'landing') void refreshHomeLiveStats();
      });
      source.addEventListener('first_blood', () => { if(activeViewName === 'landing') void refreshHomeLiveStats(); });
      source.addEventListener('error', () => {
        /* EventSource retries by default; close after the first failure so a
           missing/disabled stream cannot create a background reconnect loop. */
        realtimeUnavailable = true;
        console.warn('CyberYardHub realtime stream unavailable; live updates disabled.');
        stopRealtimeStream();
      }, {once:true});
    }catch(error){
      realtimeUnavailable = true;
      console.warn('CyberYardHub realtime stream unavailable; live updates disabled.', error);
    }
  }

  /* ---------- nav state ---------- */
  /* The primary bar only advertises destinations a guest can actually reach:
     the markup tags each one with [data-nav-auth-only] and it is hidden while
     `body` lacks `.cyh-authed`, so an anonymous visitor never sees a target
     that would bounce them straight back to a sign-in prompt — including
     during the first paint, before this file has resolved the session.
     The footer deliberately does NOT do this: it lists every page in both
     states, and the route guards in showView()/navGo() ask a guest to sign
     in. The route guards remain the actual access control; everything here
     is presentation. */
  function applyNavAccessVisibility(session){
    const authenticated = !!session;
    document.body.classList.toggle('cyh-authed', authenticated);
    document.querySelectorAll('[data-nav-auth-only]').forEach(link => {
      link.hidden = !authenticated;
      link.setAttribute('aria-hidden', String(!authenticated));
    });
  }

  async function refreshNavState(){
    const session = await getSession();
    document.getElementById('footer-year').textContent = String(new Date().getFullYear());
    document.getElementById('nav-guest').classList.toggle('hidden', !!session);
    document.getElementById('nav-user').classList.toggle('hidden', !session);
    document.getElementById('mm-guest').classList.toggle('hidden', !!session);
    document.getElementById('mm-user').classList.toggle('hidden', !session);
    applyNavAccessVisibility(session);
    syncFooterAccountState(session);
    syncAccountSubnav(session);
    if(session){
      const initial = (session.username || '?').charAt(0).toUpperCase();
      document.getElementById('nav-avatar-initial').textContent = initial;
      document.getElementById('ad-username').textContent = session.username;
      document.getElementById('ad-email').textContent = session.email;
      document.getElementById('mm-avatar-initial').textContent = initial;
      document.getElementById('mm-username').textContent = session.username;
      document.getElementById('mm-email').textContent = session.email;
    }
    await applySessionPreferences(session);
    updateActiveNav();
    void refreshHomeLiveStats();
    if(session) connectRealtimeStream(session); else stopRealtimeStream();
  }

  function initialRouteFromLocation(){
    let candidate = '';
    try{
      const hash = window.location.hash || '';
      if(hash && hash.length > 1 && !/^#(?:verify-email)\?/i.test(hash)) candidate = decodeURIComponent(hash.slice(1).split('?')[0]);
      if(!candidate){
        const queryView = new URLSearchParams(window.location.search).get('view');
        if(queryView) candidate = queryView;
      }
      if(!candidate){
        const pathPart = window.location.pathname.split('/').filter(Boolean).pop() || '';
        if(pathPart && !/^index(?:\.html)?$/i.test(pathPart)) candidate = pathPart;
      }
    }catch(_){ candidate = ''; }
    const aliases = { scoreboard:'leaderboard', submitflag:'submit-flag', 'submit_flag':'submit-flag', challenge:'challenges', home:'landing' };
    return aliases[candidate.toLowerCase()] || candidate.toLowerCase();
  }
  function restoreInitialView(){
    const route = initialRouteFromLocation();
    const authFlow = ['landing','home','about','rules','login','signup','verify-email'];
    if(!route || !document.getElementById('view-' + normalizeViewName(route))){
      currentNav='home'; updateActiveNav(); showView('landing'); return;
    }
    if(!isViewAllowed(route)){ redirectToLoginFromNav('continue'); return; }
    if(authFlow.includes(route)){
      currentNav = route === 'landing' || route === 'home' ? 'home' : null;
      updateActiveNav();
      goTo(route);
    }else{
      navGo(route);
    }
  }

  /* On startup, the server session (via GET /api/auth/me) is the very
     first thing checked — not localStorage — since it's the authoritative
     source of whether anyone is logged in. */
  document.addEventListener('DOMContentLoaded', async () => {
    cyhInitVisualPolish();
    installAuthLiveValidation();
    ['su-user', 'su-email', 'su-pass', 'su-pass2'].forEach(markAuthFieldTouched);
    const entryMatched = panelEntryOnInitialLocation || panelEntryRequested || consumeHiddenEntry();
    await refreshCurrentUser();
    await refreshNavState();
    if(entryMatched || panelEntryRequested){
      await openHiddenPanelIfAllowed();
      return;
    }
    if(!handleAuthHashRoute()) restoreInitialView();
  });

/* ---------- final accessibility + interaction polish ---------- */
(function cyhFinalInteractionLayer(){
  function syncExpandedState(){
    const avatar=document.querySelector('.avatar-btn');
    const dropdown=document.getElementById('avatar-dropdown');
    if(avatar) avatar.setAttribute('aria-expanded', dropdown?.classList.contains('open') ? 'true' : 'false');
    const hamburger=document.getElementById('hamburger-btn');
    const mobile=document.getElementById('mobile-menu');
    if(hamburger) hamburger.setAttribute('aria-expanded', mobile?.classList.contains('open') ? 'true' : 'false');
  }

  document.addEventListener('click', () => requestAnimationFrame(syncExpandedState));
  document.addEventListener('keydown', event => {
    if(event.key === 'Tab' && mobileMenuOpen){
      const panel = document.querySelector('.mobile-menu-panel');
      const focusable = [...(panel?.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])') || [])];
      if(focusable.length){
        const first = focusable[0], last = focusable[focusable.length - 1];
        if(event.shiftKey && document.activeElement === first){ event.preventDefault(); last.focus(); }
        else if(!event.shiftKey && document.activeElement === last){ event.preventDefault(); first.focus(); }
      }
    }
    if(event.key !== 'Escape') return;
    closeAvatarMenu();
    closeMobileMenu();
    syncExpandedState();
  });

  document.addEventListener('DOMContentLoaded', () => {
    syncExpandedState();
    document.querySelectorAll('[data-nav]').forEach(link => {
      if(link.classList.contains('active')) link.setAttribute('aria-current','page');
    });
  });

  /* Lightweight notification primitive for existing frontend events. */
  window.cyhNotify = function(message, type='info'){
    const toast=document.getElementById('toast');
    const msg=document.getElementById('toast-msg');
    const icon=toast?.querySelector('.ti');
    if(!toast || !msg) return;
    toast.classList.remove('toast-success','toast-error','toast-info');
    toast.classList.add('toast-'+type);
    msg.textContent=String(message || 'Updated');
    if(icon) icon.textContent=type==='success'?'✓':type==='error'?'!':'◆';
    toast.classList.add('show');
    clearTimeout(window.__cyhNotifyTimer);
    window.__cyhNotifyTimer=setTimeout(()=>toast.classList.remove('show'),3200);
  };
})();
