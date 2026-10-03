/*
 * Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
 * Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
 *
 * Seasonal theme runtime. Loaded synchronously in <head>, before any page CSS,
 * so the theme attribute is on <html> before the first paint (no flash).
 *
 *   - Theme: ?theme= -> localStorage(sc-theme) -> DEFAULT. Syncs across tabs.
 *   - Toggle: press-and-hold the footer element carrying [data-theme-toggle]
 *     (the copyright line), or hold Enter/Space on it, for HOLD_MS.
 *   - Leaves: fall only; colours come from --sc-leaf-1..6 in tokens.css; skipped
 *     entirely under prefers-reduced-motion; paused while the tab is hidden.
 *
 * Everything this file injects carries [data-seasonal] so tooling can ignore it.
 * Nothing here may throw into the page: every entry point is guarded.
 * See docs/THEMING.md.
 */
(function () {
  'use strict';

  var THEMES = ['fall', 'original'];
  var DEFAULT_THEME = 'fall';
  var KEY = 'sc-theme';
  var HOLD_MS = 700;
  var LABEL = { fall: 'Fall', original: 'Original' };
  // Webfonts the fall theme uses (Fraunces display with its SOFT/WONK axes, plus
  // DM Sans and JetBrains Mono so every page shares one type system in fall).
  // Loaded only while fall is active, so the original theme pays nothing for it.
  var FALL_FONTS = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT,WONK@9..144,400..700,0..100,0..1&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap';

  var root = document.documentElement;

  function store(get, value) {
    try {
      if (get) return window.localStorage.getItem(KEY);
      window.localStorage.setItem(KEY, value);
    } catch (e) { /* private mode / blocked storage: theme just won't persist */ }
    return null;
  }
  function valid(t) { return THEMES.indexOf(t) !== -1; }

  function resolve() {
    var fromUrl = null;
    try { fromUrl = new URLSearchParams(window.location.search).get('theme'); } catch (e) {}
    if (valid(fromUrl)) { store(false, fromUrl); return fromUrl; }
    var saved = store(true);
    return valid(saved) ? saved : DEFAULT_THEME;
  }

  // ---- 1. Pre-paint ------------------------------------------------------
  var current = resolve();
  root.setAttribute('data-theme', current);
  if (current === 'fall') loadFonts();

  function loadFonts() {
    if (!FALL_FONTS || document.querySelector('link[data-seasonal-font]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = FALL_FONTS;
    l.setAttribute('data-seasonal', '');
    l.setAttribute('data-seasonal-font', '');
    (document.head || root).appendChild(l);
  }

  // ---- 2. Applying a theme -----------------------------------------------
  function apply(theme, persist) {
    if (!valid(theme)) return;
    current = theme;
    root.setAttribute('data-theme', theme);
    if (persist) store(false, theme);
    if (theme === 'fall') loadFonts();
    syncThemeColor();
    syncLeaves();
    try { window.dispatchEvent(new CustomEvent('sc-themechange', { detail: { theme: theme } })); } catch (e) {}
  }

  var originalThemeColor = null;
  function syncThemeColor() {
    try {
      var meta = document.querySelector('meta[name="theme-color"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'theme-color';
        meta.setAttribute('data-seasonal', '');
        document.head.appendChild(meta);
      }
      if (originalThemeColor === null) originalThemeColor = meta.getAttribute('content') || '';
      var bg = getComputedStyle(root).getPropertyValue('--sc-bg').trim();
      meta.setAttribute('content', current === 'original' && originalThemeColor ? originalThemeColor : (bg || originalThemeColor || '#0a0a0a'));
    } catch (e) {}
  }

  // ---- 3. Toggle on the copyright line -----------------------------------
  function findToggles() {
    var marked = document.querySelectorAll('[data-theme-toggle]');
    if (marked.length) return Array.prototype.slice.call(marked);
    // Fallback for a page that has not been marked: the first element in the
    // footer whose own text carries a copyright sign.
    var footer = document.querySelector('footer');
    if (!footer) return [];
    var walker = document.createTreeWalker(footer, NodeFilter.SHOW_TEXT);
    for (var n = walker.nextNode(); n; n = walker.nextNode()) {
      if (/©/.test(n.nodeValue)) return [n.parentElement];
    }
    return [];
  }

  function next() { return current === 'fall' ? 'original' : 'fall'; }

  function wire(el) {
    if (el.__scWired) return;
    el.__scWired = true;
    el.classList.add('sc-toggle');
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    var hint = document.createElement('span');
    hint.className = 'sc-vh';
    hint.setAttribute('data-seasonal', '');
    el.appendChild(hint);
    function describe() {
      var msg = 'Press and hold to switch to the ' + LABEL[next()] + ' theme';
      el.setAttribute('title', msg);
      hint.textContent = ' (' + msg.toLowerCase() + ')';
    }
    describe();
    window.addEventListener('sc-themechange', describe);

    var timer = null, startX = 0, startY = 0, fired = false;
    function start(x, y) {
      cancel();
      fired = false; startX = x; startY = y;
      el.classList.add('sc-holding');
      timer = window.setTimeout(function () {
        timer = null; fired = true;
        el.classList.remove('sc-holding');
        try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {}
        apply(next(), true);
        toast();
      }, HOLD_MS);
    }
    function cancel() {
      if (timer) { window.clearTimeout(timer); timer = null; }
      el.classList.remove('sc-holding');
    }

    el.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      start(e.clientX, e.clientY);
    });
    el.addEventListener('pointermove', function (e) {
      // A scroll or a drag is not a hold.
      if (timer && (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10)) cancel();
    });
    ['pointerup', 'pointercancel', 'pointerleave', 'blur'].forEach(function (t) { el.addEventListener(t, cancel); });
    // Android raises the long-press context menu at ~500ms; it would steal the hold.
    el.addEventListener('contextmenu', function (e) { if (timer || fired) e.preventDefault(); });
    // A completed hold must not also follow a link the line might sit inside.
    el.addEventListener('click', function (e) { if (fired) { e.preventDefault(); e.stopPropagation(); fired = false; } }, true);

    el.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); start(0, 0); }
      else if (e.key === ' ') e.preventDefault(); // stop page scroll on held Space
    });
    el.addEventListener('keyup', function (e) { if (e.key === 'Enter' || e.key === ' ') cancel(); });
  }

  var toastEl = null, toastTimer = null;
  function toast() {
    try {
      if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.className = 'sc-toast';
        toastEl.setAttribute('role', 'status');
        toastEl.setAttribute('aria-live', 'polite');
        toastEl.setAttribute('data-seasonal', '');
        document.body.appendChild(toastEl);
      }
      toastEl.textContent = LABEL[current] + ' theme. Hold © again for ' + LABEL[next()] + '.';
      toastEl.classList.add('sc-toast-on');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(function () { toastEl.classList.remove('sc-toast-on'); }, 3200);
    } catch (e) {}
  }

  // Runtime UI styles. Not theme-scoped: the toggle has to work in every theme,
  // including original. Colours come from tokens with literal fallbacks.
  function injectStyles() {
    if (document.querySelector('style[data-seasonal-ui]')) return;
    var s = document.createElement('style');
    s.setAttribute('data-seasonal', '');
    s.setAttribute('data-seasonal-ui', '');
    s.textContent = [
      '.sc-toggle{cursor:pointer;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:manipulation;-webkit-tap-highlight-color:transparent;position:relative}',
      '.sc-toggle:focus-visible{outline:2px solid var(--sc-accent,#22c55e);outline-offset:3px;border-radius:4px}',
      '.sc-toggle.sc-holding::after{content:"";position:absolute;left:0;bottom:-4px;height:2px;width:100%;background:var(--sc-accent,#22c55e);transform-origin:left;transform:scaleX(0);animation:sc-hold ' + HOLD_MS + 'ms linear forwards;border-radius:2px;pointer-events:none}',
      '@keyframes sc-hold{to{transform:scaleX(1)}}',
      '.sc-vh{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}',
      '.sc-toast{position:fixed;left:50%;bottom:max(1.25rem,env(safe-area-inset-bottom));transform:translate(-50%,1rem);opacity:0;pointer-events:none;z-index:2147483000;',
      'max-width:calc(100vw - 2rem);padding:.7rem 1.1rem;border-radius:999px;font:600 .85rem/1.3 var(--sc-font-sans,system-ui,sans-serif);',
      'background:var(--sc-surface-2,#1a1a1a);color:var(--sc-text,#fff);border:1px solid var(--sc-border-2,#333);box-shadow:0 12px 32px -12px rgba(0,0,0,.6);transition:opacity .25s,transform .25s;text-align:center}',
      '.sc-toast.sc-toast-on{opacity:1;transform:translate(-50%,0)}',
      '@media (prefers-reduced-motion:reduce){.sc-toggle.sc-holding::after{animation-duration:1ms}.sc-toast{transition:none}}'
    ].join('');
    document.head.appendChild(s);
  }

  // ---- 4. Falling leaves (fall only) -------------------------------------
  // Silhouettes on a 24x24 grid: sugar maple, red oak, birch, elm.
  var LEAF_PATHS = [
    'M12 1.6l1.5 3.4 3-1.3-.7 3.7 3.4.4-2.2 2.7 3.1 1.5-3.4 1.1.9 3.4-3.4-1.5-1.3 3.2-.4 3.8h-1l-.4-3.8-1.3-3.2-3.4 1.5.9-3.4-3.4-1.1 3.1-1.5-2.2-2.7 3.4-.4-.7-3.7 3 1.3z',
    'M12 2c1.4 1.3 1 2.9 2.4 3.4s2.4-1 3 .5-1.4 2.4-.5 3.4 2.4-.4 2.9 1-1.9 2.4-1 3.4 1.9 0 1.9 1.4-2.4 1.9-3.8 2.4c-1 .3-1.9 1.4-3.4 1.9V22h-1v-2.6c-1.5-.5-2.4-1.6-3.4-1.9-1.4-.5-3.8-1-3.8-2.4s1-1.4 1.9-1.4-1.4-1.9-1-3.4 1.9 0 2.9-1-1.4-1.9-1-3.4 1.9.5 2.9-1S10.6 3.3 12 2z',
    'M12 2.2C8.2 5.3 5.8 8.9 5.8 12.6c0 3.4 2.6 6 5.7 6.3V22h1v-3.1c3.1-.3 5.7-2.9 5.7-6.3 0-3.7-2.4-7.3-6.2-10.4z',
    'M12 2.5c-3 2.2-5.6 5.2-5.9 8.6-.2 1.9.5 3.6 1.8 4.9l-.9.6 1.5.5c1 .7 2.2 1.1 3 1.2V22h1v-3.7c.8-.1 2-.5 3-1.2l1.5-.5-.9-.6c1.3-1.3 2-3 1.8-4.9-.3-3.4-2.9-6.4-5.9-8.6z'
  ];
  var leavesEl = null;
  var reduceMotion = null;

  function wantsLeaves() {
    return current === 'fall' && !(reduceMotion && reduceMotion.matches);
  }

  function buildLeaves() {
    var mobile = window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
    var count = mobile ? 7 : 14;
    var box = document.createElement('div');
    box.className = 'sc-leaves';
    box.setAttribute('aria-hidden', 'true');
    box.setAttribute('data-seasonal', '');
    // Deterministic spread (golden-ratio stepping) rather than Math.random(): the
    // field looks scattered but never clumps, and a reload looks the same.
    var phi = 0.6180339887;
    for (var i = 0; i < count; i++) {
      var f = (i * phi) % 1, g = (i * phi * phi + 0.37) % 1;
      var leaf = document.createElement('span');
      leaf.className = 'sc-leaf';
      var size = 14 + Math.round(g * 16);
      var dur = 13 + f * 11;
      leaf.style.cssText =
        '--x:' + (f * 100).toFixed(2) + 'vw;' +
        '--size:' + size + 'px;' +
        '--dur:' + dur.toFixed(2) + 's;' +
        '--delay:' + (-(g * dur)).toFixed(2) + 's;' +
        '--sway:' + (3 + g * 3).toFixed(2) + 's;' +
        '--drift:' + Math.round((g - 0.5) * 140) + 'px;' +
        '--spin:' + Math.round(180 + f * 360) * (i % 2 ? 1 : -1) + 'deg;' +
        '--o:' + (0.55 + g * 0.35).toFixed(2) + ';' +
        'color:var(--sc-leaf-' + ((i % 6) + 1) + ')';
      leaf.innerHTML = '<span class="sc-leaf-sway"><svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" focusable="false">' +
        '<path fill="currentColor" d="' + LEAF_PATHS[i % LEAF_PATHS.length] + '"/>' +
        '<path d="M12 6v14" stroke="currentColor" stroke-opacity=".45" stroke-width=".8" fill="none" style="filter:brightness(.55)"/></svg></span>';
      box.appendChild(leaf);
    }
    return box;
  }

  function syncLeaves() {
    try {
      if (!document.body) return;
      if (wantsLeaves()) {
        if (!leavesEl) { leavesEl = buildLeaves(); document.body.insertBefore(leavesEl, document.body.firstChild); }
      } else if (leavesEl) {
        leavesEl.parentNode.removeChild(leavesEl);
        leavesEl = null;
      }
    } catch (e) {}
  }

  document.addEventListener('visibilitychange', function () {
    if (leavesEl) leavesEl.classList.toggle('sc-paused', document.hidden);
  });

  // ---- 5. Boot ------------------------------------------------------------
  // Keep other tabs in step with a switch made in this one.
  window.addEventListener('storage', function (e) {
    if (e.key === KEY && valid(e.newValue) && e.newValue !== current) apply(e.newValue, false);
  });

  function ready() {
    try {
      injectStyles();
      findToggles().forEach(wire);
      try {
        reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        var onChange = function () { syncLeaves(); };
        if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', onChange);
        else if (reduceMotion.addListener) reduceMotion.addListener(onChange);
      } catch (e) {}
      syncThemeColor();
      syncLeaves();
      // Drop ?theme= once honoured so shared links stay clean.
      try {
        var u = new URL(window.location.href);
        if (u.searchParams.has('theme')) { u.searchParams.delete('theme'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); }
      } catch (e) {}
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();

  // Small public surface for support/debugging: window.scTheme.set('original').
  window.scTheme = { get: function () { return current; }, set: function (t) { apply(t, true); }, themes: THEMES.slice() };
})();
