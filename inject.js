// we-wallpaper-dsh browser injection
// Loaded by the DSH web GUI (added as a <script> tag in dist/index.html).
// Creates a fullscreen background video layer + a small switching control,
// a fully transparent app shell, a font-color control, and a per-wallpaper
// video preview overlay.
(function () {
  'use strict';
  var API = 'http://127.0.0.1:8899';
  var state = { list: [], index: -1, playing: true, speedIdx: 0, fontColor: null, fontShadow: false };
  var SPEEDS = [1, 0.75, 0.5];
  var FONT_PRESETS = [
    { name: '白', color: '#f5f7fa' },
    { name: '黑', color: '#101218' },
    { name: '浅灰', color: '#c8cdd6' },
    { name: '蓝', color: '#8ab4ff' },
    { name: '绿', color: '#8ee6b0' },
    { name: '黄', color: '#ffd98a' },
    { name: '红', color: '#ff9b9b' },
    { name: '紫', color: '#d0b3ff' }
  ];
  // The dsw alias tokens that drive text color across the app. Redefined on
  // #root they cascade to the whole conversation UI.
  var FONT_TOKENS = [
    '--dsw-alias-label-primary',
    '--dsw-alias-label-primary-foreground',
    '--dsw-alias-label-primary-dimmed',
    '--dsw-alias-label-secondary',
    '--dsw-alias-label-tertiary',
    '--dsw-alias-label-caption',
    '--dsw-alias-brand-text'
  ];
  // Background tokens made transparent so the wallpaper is the page bg.
  var BG_TOKENS = [
    '--dsw-alias-bg-base',
    '--dsw-alias-bg-layer-1',
    '--dsw-alias-bg-layer-2',
    '--dsw-alias-bg-layer-3',
    '--dsw-alias-bg-module-platform',
    '--dsw-alias-bg-overlay',
    '--dsw-alias-bg-multi-select',
    '--dsw-alias-bg-skeleton',
    '--dsw-alias-bg-mask-1',
    '--dsw-alias-bg-mask-2',
    '--dsw-alias-bg-mask-3',
    '--dsw-alias-bg-mask-drop',
    '--dsw-alias-bg-mask-photo',
    '--dsw-specific-sidebar-fill',
    '--dsw-specific-menu',
    '--dsw-specific-selector',
    '--dsw-specific-tip',
    '--dsw-specific-bubble',
    '--dsw-linear-gradient-think'
  ];

  if (window.__weWallpaperLoaded) return;
  window.__weWallpaperLoaded = true;

  // ---- styles --------------------------------------------------------------
  var style = document.createElement('style');
  style.id = 'we-wallpaper-style';
  style.textContent = [
    'html, body { background: transparent !important; }',
    // The wallpaper layer sits at z-index 0, below the app (z-index 1).
    '#we-bg-video {',
    '  position: fixed; inset: 0; width: 100vw; height: 100vh;',
    '  object-fit: cover; z-index: 0; background: #000;',
    '}',
    // Raise the whole app shell above the wallpaper; make the shell and its
    // large surface tokens fully transparent so the video shows through
    // completely.
    '#root { position: relative; z-index: 1; }',
    '#root {',
    BG_TOKENS.map(function (t) { return '  ' + t + ': transparent;'; }).join('\n'),
    '}',
    '#we-bg-toggle {',
    '  position: fixed; right: 16px; bottom: 16px; z-index: 9000;',
    '  display: inline-flex; align-items: center; gap: 6px;',
    '  padding: 8px 12px; border: 1px solid rgba(255,255,255,0.22);',
    '  border-radius: 999px; cursor: pointer;',
    '  background: rgba(16, 18, 26, 0.72); color: #e6e8ee;',
    '  font: 13px/1.4 system-ui, "Segoe UI", sans-serif;',
    '  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);',
    '  box-shadow: 0 4px 16px rgba(0,0,0,0.35); user-select: none;',
    '}',
    '#we-bg-toggle:hover { background: rgba(30, 34, 46, 0.85); }',
    '#we-bg-toggle .we-icon { font-size: 14px; }',
    '#we-bg-panel {',
    '  position: fixed; right: 16px; bottom: 52px; z-index: 9000;',
    '  display: none; flex-direction: column; gap: 2px;',
    '  width: min(400px, calc(100vw - 32px)); max-height: 66vh; overflow-y: auto;',
    '  padding: 6px; border: 1px solid rgba(255,255,255,0.18); border-radius: 12px;',
    '  background: rgba(16, 18, 26, 0.88); color: #e6e8ee;',
    '  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);',
    '  box-shadow: 0 8px 28px rgba(0,0,0,0.45);',
    '}',
    '#we-bg-panel.open { display: flex; }',
    // Wallpaper grid: two large preview tiles per row, no titles.
    '#we-bg-panel .we-items {',
    '  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;',
    '  padding: 4px 6px 6px;',
    '}',
    '#we-bg-panel .we-item {',
    '  display: flex; flex-direction: column; gap: 4px;',
    '  padding: 4px; border-radius: 10px; cursor: pointer;',
    '  position: relative; overflow: hidden;',
    '}',
    '#we-bg-panel .we-item:hover { background: rgba(255,255,255,0.09); }',
    '#we-bg-panel .we-item.active {',
    '  outline: 2px solid #4d7cff; background: rgba(90, 130, 255, 0.22);',
    '}',
    '#we-bg-panel .we-item .we-thumb {',
    '  width: 100%; aspect-ratio: 16/9; border-radius: 7px;',
    '  object-fit: cover; background: #1c2029;',
    '  display: flex; align-items: center; justify-content: center;',
    '  font-size: 20px; overflow: hidden;',
    '}',
    '#we-bg-panel .we-item .we-meta {',
    '  display: flex; align-items: center; justify-content: space-between; gap: 4px;',
    '  padding: 0 3px; font: 11px/1.4 system-ui, "Segoe UI", sans-serif;',
    '  color: #8b92a3;',
    '}',
    '#we-bg-panel .we-item .we-preview-btn {',
    '  flex: none; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px;',
    '  background: rgba(255,255,255,0.08); color: #e6e8ee; font-size: 11px;',
    '  padding: 1px 7px; cursor: pointer;',
    '}',
    '#we-bg-panel .we-item .we-preview-btn:hover { background: rgba(255,255,255,0.18); }',
    // Control rows.
    '#we-bg-speed, #we-bg-font, #we-bg-refresh {',
    '  display: flex; align-items: center; justify-content: space-between; gap: 8px;',
    '  padding: 6px 10px; margin-bottom: 4px;',
    '  border-bottom: 1px solid rgba(255,255,255,0.12);',
    '  font: 12px/1.4 system-ui, "Segoe UI", sans-serif; color: #aab0c0;',
    '}',
    '#we-bg-speed button, #we-bg-refresh button {',
    '  border: 1px solid rgba(255,255,255,0.2); border-radius: 6px;',
    '  background: rgba(255,255,255,0.08); color: #e6e8ee;',
    '  font: 12px/1.4 system-ui, "Segoe UI", sans-serif;',
    '  padding: 2px 8px; cursor: pointer;',
    '}',
    '#we-bg-speed button:hover, #we-bg-font button:hover, #we-bg-refresh button:hover { background: rgba(255,255,255,0.16); }',
    '#we-bg-refresh button:disabled { opacity: 0.6; cursor: default; }',
    '#we-bg-refresh .we-refresh-ok { color: #8ee6b0; }',
    '#we-bg-speed .we-speed-val { font-weight: 600; color: #e6e8ee; }',
    '#we-bg-font .we-font-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }',
    '#we-bg-font .we-swatch {',
    '  width: 20px; height: 20px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.25);',
    '  cursor: pointer; padding: 0; position: relative;',
    '}',
    '#we-bg-font .we-swatch.active { border-color: #8ab4ff; box-shadow: 0 0 0 2px rgba(138,180,255,0.35); }',
    '#we-bg-font .we-swatch.we-custom { overflow: hidden; background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red); }',
    '#we-bg-font .we-swatch.we-custom input { position: absolute; inset: -6px; opacity: 0; cursor: pointer; }',
    '#we-bg-font .we-reset {',
    '  border: 1px solid rgba(255,255,255,0.2); border-radius: 6px;',
    '  background: rgba(255,255,255,0.08); color: #e6e8ee;',
    '  font: 12px/1.4 system-ui, "Segoe UI", sans-serif; padding: 3px 8px; cursor: pointer;',
    '}',
    '#we-bg-font #we-font-shadow-row {',
    '  display: flex; align-items: center; gap: 6px; margin: 0 10px 6px;',
    '  font: 12px/1.4 system-ui, "Segoe UI", sans-serif; color: #c8cdd6; cursor: pointer;',
    '  user-select: none;',
    '}',
    // Preview overlay.
    '#we-preview-overlay {',
    '  position: fixed; inset: 0; z-index: 9500; display: none;',
    '  align-items: center; justify-content: center;',
    '  background: rgba(0,0,0,0.55); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);',
    '}',
    '#we-preview-overlay.open { display: flex; }',
    '#we-preview-card {',
    '  width: min(780px, calc(100vw - 32px)); border-radius: 14px;',
    '  border: 1px solid rgba(255,255,255,0.18);',
    '  background: rgba(16, 18, 26, 0.92); color: #e6e8ee;',
    '  box-shadow: 0 16px 48px rgba(0,0,0,0.6); overflow: hidden;',
    '  font: 13px/1.5 system-ui, "Segoe UI", sans-serif;',
    '}',
    '#we-preview-card .we-preview-head {',
    '  display: flex; align-items: center; gap: 8px; padding: 10px 14px;',
    '  border-bottom: 1px solid rgba(255,255,255,0.1);',
    '}',
    '#we-preview-card .we-preview-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }',
    '#we-preview-card .we-preview-close {',
    '  border: none; background: transparent; color: #aab0c0; font-size: 16px;',
    '  cursor: pointer; padding: 2px 6px; border-radius: 6px; line-height: 1;',
    '}',
    '#we-preview-card .we-preview-close:hover { background: rgba(255,255,255,0.12); color: #fff; }',
    '#we-preview-card .we-preview-video {',
    '  width: 100%; max-height: 68vh; aspect-ratio: 16/9;',
    '  object-fit: contain; background: #000; display: block; margin: 0 auto;',
    '}',
    '#we-preview-card .we-preview-meta { padding: 8px 14px; color: #aab0c0; font-size: 12px; }',
    '#we-preview-card .we-preview-apply {',
    '  display: block; margin: 0 14px 14px; width: calc(100% - 28px);',
    '  border: none; border-radius: 8px; padding: 8px 0; cursor: pointer;',
    '  background: #4d7cff; color: #fff; font: 13px/1.4 system-ui, "Segoe UI", sans-serif;',
    '}',
    '#we-preview-card .we-preview-apply:hover { background: #6b92ff; }'
  ].join('\n');

  function boot() {
    if (!document.body) {
      // Running before <body> exists (e.g. classic script in <head>): wait.
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
        return;
      }
    }
    install();
  }

  // ---- background layers ---------------------------------------------------
  var video;
  var toggle;
  var panel;
  var overlay;
  var overlayVideo;

  function install() {
    document.head.appendChild(style);

    // Make the app shell background fully transparent so the wallpaper shows
    // through completely. DSH's main frame and inner surface containers paint
    // opaque backgrounds (--dsw-alias-bg-base / --dsw-specific-sidebar-fill
    // and layer tokens); several masks/overlays also carry a backdrop-filter
    // (frosted-glass blur) and translucent fills (--dsw-alias-bg-mask-*,
    // #0000003d) that must be cleared too, or a blurred "band" stays visible
    // across the wallpaper.
    function isOurs(el) {
      return !!(el.id && el.id.indexOf('we-') === 0);
    }
    function neutralizeFrames() {
      // Walk the whole <body> rather than only the app frame: mask / overlay
      // layers can be rendered as siblings of the shell (portals) and are
      // exactly the translucent strips users still see.
      var walk = function (el, depth) {
        if (!el || depth > 10 || isOurs(el)) return;
        var cs;
        try { cs = getComputedStyle(el); } catch (e) { return; }
        var bg = cs.backgroundColor;
        var hasBg = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
        var img = cs.backgroundImage;
        var hasImg = img && img !== 'none';
        var filter = cs.backdropFilter || cs.webkitBackdropFilter;
        var hasFilter = filter && filter !== 'none';
        if (hasBg || hasImg || hasFilter) {
          var rect = el.getBoundingClientRect();
          // Clear wide surfaces and full-width strips (toolbars, dividers,
          // overlays) while keeping small controls legible.
          if (rect.width > 120 && rect.height > 16) {
            if (hasBg || hasImg) {
              el.style.background = 'transparent';
              el.style.backgroundColor = 'transparent';
              el.style.backgroundImage = 'none';
            }
            if (hasFilter) {
              el.style.backdropFilter = 'none';
              el.style.webkitBackdropFilter = 'none';
            }
          }
        }
        for (var i = 0; i < el.children.length; i++) walk(el.children[i], depth + 1);
      };
      walk(document.body, 0);
    }
    neutralizeFrames();
    if (typeof MutationObserver !== 'undefined') {
      var mo = new MutationObserver(function () {
        neutralizeFrames();
      });
      mo.observe(document.body, { childList: true, subtree: true });
      window.__weWallpaperObserver = mo;
    }

    video = document.createElement('video');
    video.id = 'we-bg-video';
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.playbackRate = 1; // pin speed: some files report odd rates
    document.body.appendChild(video);

    // If a wallpaper fails to load (missing file, codec error), skip to the
    // next one instead of showing a black screen.
    video.addEventListener('error', function () {
      console.warn('[we-wallpaper] load error, skipping:', state.list[state.index] && state.list[state.index].title);
      if (state.list.length > 1) {
        state.index = (state.index + 1) % state.list.length;
        apply();
      }
    });
    // After switching, make sure playback actually starts.
    video.addEventListener('loadeddata', function () {
      if (video.paused) video.play().catch(function () {});
    });

    // ---- control UI ----------------------------------------------------------
    toggle = document.createElement('button');
    toggle.id = 'we-bg-toggle';
    toggle.type = 'button';
    toggle.innerHTML = '<span class="we-icon">🎞</span><span class="we-label">壁纸</span>';
    document.body.appendChild(toggle);

    panel = document.createElement('div');
    panel.id = 'we-bg-panel';
    document.body.appendChild(panel);

    // Speed control (some wallpapers have fast-moving content; allow slowing
    // them down). Cycles 1x -> 0.75x -> 0.5x, remembered across reloads.
    state.speedIdx = 0;
    try {
      var savedSpeed = parseFloat(localStorage.getItem('we-wallpaper-speed') || '1');
      for (var si = 0; si < SPEEDS.length; si++) {
        if (Math.abs(SPEEDS[si] - savedSpeed) < 0.001) { state.speedIdx = si; break; }
      }
    } catch (e) {}
    video.playbackRate = SPEEDS[state.speedIdx];

    // Font color / shadow preferences, remembered across reloads.
    try {
      state.fontColor = localStorage.getItem('we-wallpaper-font-color') || null;
      state.fontShadow = localStorage.getItem('we-wallpaper-font-shadow') === '1';
    } catch (e) {}
    applyFontColor();

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = panel.classList.toggle('open');
      if (open && panel.childElementCount === 0) renderPanel();
    });
    document.addEventListener('click', function () {
      panel.classList.remove('open');
    });
    panel.addEventListener('click', function (e) {
      e.stopPropagation();
    });

    // Preview overlay (created lazily on first use).
    overlay = document.createElement('div');
    overlay.id = 'we-preview-overlay';
    overlay.innerHTML =
      '<div id="we-preview-card">' +
      '  <div class="we-preview-head"><span class="we-preview-title"></span>' +
      '  <button type="button" class="we-preview-close" title="关闭">✕</button></div>' +
      '  <video class="we-preview-video" muted loop playsinline preload="auto"></video>' +
      '  <div class="we-preview-meta"></div>' +
      '  <button type="button" class="we-preview-apply">应用此壁纸</button>' +
      '</div>';
    document.body.appendChild(overlay);
    overlayVideo = overlay.querySelector('.we-preview-video');
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closePreview();
    });
    overlay.querySelector('.we-preview-close').addEventListener('click', closePreview);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closePreview();
    });

    // Keyboard shortcut: Alt+W cycles wallpapers, Alt+P toggles play/pause.
    document.addEventListener('keydown', function (e) {
      if (!e.altKey) return;
      if (e.key === 'w' || e.key === 'W') { e.preventDefault(); shuffle(); }
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        if (video.paused) { video.play().catch(function () {}); state.playing = true; }
        else { video.pause(); state.playing = false; }
      }
    });

    loadCatalog();
  }

  // ---- font color ----------------------------------------------------------
  function applyFontColor() {
    var root = document.getElementById('root');
    if (!root) return;
    var c = state.fontColor;
    for (var i = 0; i < FONT_TOKENS.length; i++) {
      if (c) root.style.setProperty(FONT_TOKENS[i], c);
      else root.style.removeProperty(FONT_TOKENS[i]);
    }
    if (c) root.style.color = c;
    else root.style.color = '';
    // Subtle dark outline keeps light fonts readable over bright wallpapers.
    if (state.fontShadow) {
      root.style.textShadow = '0 1px 2px rgba(0,0,0,0.7), 0 0 8px rgba(0,0,0,0.4)';
    } else {
      root.style.textShadow = '';
    }
    syncFontUI();
  }

  function syncFontUI() {
    if (!panel || !panel.querySelector('#we-bg-font')) return;
    var swatches = panel.querySelectorAll('#we-bg-font .we-swatch[data-c]');
    for (var i = 0; i < swatches.length; i++) {
      swatches[i].classList.toggle('active', swatches[i].dataset.c === state.fontColor);
    }
    var shadow = panel.querySelector('#we-font-shadow');
    if (shadow) shadow.checked = !!state.fontShadow;
  }

  function setFontColor(c) {
    state.fontColor = c;
    try {
      if (c) localStorage.setItem('we-wallpaper-font-color', c);
      else localStorage.removeItem('we-wallpaper-font-color');
    } catch (e) {}
    applyFontColor();
  }

  function setFontShadow(on) {
    state.fontShadow = !!on;
    try {
      if (state.fontShadow) localStorage.setItem('we-wallpaper-font-shadow', '1');
      else localStorage.removeItem('we-wallpaper-font-shadow');
    } catch (e) {}
    applyFontColor();
  }

  // ---- preview -------------------------------------------------------------
  function openPreview(id) {
    for (var i = 0; i < state.list.length; i++) {
      if (state.list[i].id === id) {
        var w = state.list[i];
        overlay.querySelector('.we-preview-title').textContent = w.title;
        var meta = (fmtDuration(w.durationSec) ? fmtDuration(w.durationSec) + ' · ' : '') + w.sizeMB + 'MB';
        if (w.file) meta += ' · ' + w.file;
        overlay.querySelector('.we-preview-meta').textContent = meta;
        overlayVideo.src = API + '/media/' + encodeURIComponent(w.id) + '/' + encodeURIComponent(w.file);
        overlayVideo.play().catch(function () {});
        overlay.classList.add('open');
        return;
      }
    }
  }

  function closePreview() {
    overlay.classList.remove('open');
    overlayVideo.pause();
    overlayVideo.removeAttribute('src');
    overlayVideo.load();
  }

  // ---- logic ---------------------------------------------------------------
  function loadCatalog() {
    fetch(API + '/api/wallpapers')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.list = (data && data.wallpapers) || [];
        if (state.list.length === 0) return;
        // Remember the last chosen wallpaper across page reloads.
        var saved = null;
        try { saved = localStorage.getItem('we-wallpaper-id'); } catch (e) {}
        var savedIdx = -1;
        if (saved) {
          for (var i = 0; i < state.list.length; i++) {
            if (state.list[i].id === saved) { savedIdx = i; break; }
          }
        }
        if (savedIdx >= 0) {
          state.index = savedIdx;
        } else {
          // Default: prefer a wallpaper with a comfortable length (15–120s)
          // so looping looks natural; fall back to the smallest file.
          var preferred = state.list.filter(function (w) {
            return w.durationSec >= 15 && w.durationSec <= 120;
          });
          var pool = preferred.length ? preferred : state.list.slice();
          pool.sort(function (a, b) { return a.durationSec - b.durationSec || a.sizeMB - b.sizeMB; });
          state.index = state.list.indexOf(pool[0]);
          if (state.index === -1) state.index = 0;
        }
        apply();
      })
      .catch(function (err) {
        console.warn('[we-wallpaper] catalog load failed:', err);
      });
  }

  function pick(id) {
    for (var i = 0; i < state.list.length; i++) {
      if (state.list[i].id === id) {
        state.index = i;
        apply();
        return;
      }
    }
  }

  function apply() {
    var w = state.list[state.index];
    if (!w) return;
    var src = API + '/media/' + encodeURIComponent(w.id) + '/' + encodeURIComponent(w.file);
    if (video.src !== src) {
      video.src = src;
      video.play().catch(function () {});
    }
    // Remember the choice for the next page load.
    try { localStorage.setItem('we-wallpaper-id', w.id); } catch (e) {}
    var items = panel.querySelectorAll('.we-item');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('active', items[i].dataset.id === w.id);
    }
    var label = toggle.querySelector('.we-label');
    if (label) label.textContent = w.title.length > 14 ? w.title.slice(0, 14) + '…' : w.title;
  }

  function fmtDuration(sec) {
    if (!sec || sec <= 0) return '';
    sec = Math.round(sec);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m > 0 ? m + ':' + (s < 10 ? '0' + s : s) : s + 's';
  }

  function cycleSpeed() {
    state.speedIdx = (state.speedIdx + 1) % SPEEDS.length;
    if (video) video.playbackRate = SPEEDS[state.speedIdx];
    try { localStorage.setItem('we-wallpaper-speed', String(SPEEDS[state.speedIdx])); } catch (e) {}
    var val = document.querySelector('#we-bg-speed .we-speed-val');
    if (val) val.textContent = SPEEDS[state.speedIdx] + 'x';
  }

  function renderPanel() {
    panel.innerHTML = '';

    // Speed control row (always first, re-created on open).
    var speedRow = document.createElement('div');
    speedRow.id = 'we-bg-speed';
    var speedLabel = document.createElement('span');
    speedLabel.textContent = '播放速度';
    var speedBtn = document.createElement('button');
    speedBtn.type = 'button';
    speedBtn.innerHTML = '<span class="we-speed-val">' + SPEEDS[state.speedIdx] + 'x</span> <span class="we-speed-hint">点击调节</span>';
    speedBtn.addEventListener('click', function () {
      cycleSpeed();
    });
    speedRow.appendChild(speedLabel);
    speedRow.appendChild(speedBtn);
    panel.appendChild(speedRow);

    // Wallpaper list refresh row: re-scan the workshop folder without
    // reloading the page (new Steam subscriptions show up here).
    var refreshRow = document.createElement('div');
    refreshRow.id = 'we-bg-refresh';
    var refreshLabel = document.createElement('span');
    refreshLabel.textContent = '壁纸列表';
    var refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'we-refresh-btn';
    refreshBtn.textContent = '刷新';
    refreshBtn.title = '重新扫描壁纸文件夹（新增订阅后点这里）';
    refreshBtn.addEventListener('click', refreshCatalog);
    refreshRow.appendChild(refreshLabel);
    refreshRow.appendChild(refreshBtn);
    panel.appendChild(refreshRow);

    // Font color row.
    var fontRow = document.createElement('div');
    fontRow.id = 'we-bg-font';
    var fontLabel = document.createElement('span');
    fontLabel.textContent = '字体颜色';
    var colorSet = document.createElement('div');
    colorSet.className = 'we-font-row';
    FONT_PRESETS.forEach(function (preset) {
      var sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'we-swatch' + (preset.color === state.fontColor ? ' active' : '');
      sw.dataset.c = preset.color;
      sw.title = preset.name;
      sw.style.background = preset.color;
      sw.addEventListener('click', function () {
        setFontColor(preset.color);
      });
      colorSet.appendChild(sw);
    });
    // Custom color picker.
    var custom = document.createElement('button');
    custom.type = 'button';
    custom.className = 'we-swatch we-custom' + (FONT_PRESETS.every(function (p) { return p.color !== state.fontColor; }) && state.fontColor ? ' active' : '');
    custom.title = '自定义颜色';
    var picker = document.createElement('input');
    picker.type = 'color';
    picker.value = state.fontColor || '#f5f7fa';
    picker.addEventListener('input', function () {
      setFontColor(picker.value);
      custom.classList.add('active');
    });
    custom.appendChild(picker);
    colorSet.appendChild(custom);
    // Reset to theme default.
    var reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'we-reset';
    reset.textContent = '默认';
    reset.title = '恢复 DSH 主题默认文字颜色';
    reset.addEventListener('click', function () {
      setFontColor(null);
    });
    colorSet.appendChild(reset);
    fontRow.appendChild(fontLabel);
    fontRow.appendChild(colorSet);
    panel.appendChild(fontRow);

    // Shadow toggle.
    var shadowRow = document.createElement('label');
    shadowRow.id = 'we-font-shadow-row';
    var shadowInput = document.createElement('input');
    shadowInput.type = 'checkbox';
    shadowInput.id = 'we-font-shadow';
    shadowInput.checked = !!state.fontShadow;
    shadowInput.addEventListener('change', function () {
      setFontShadow(shadowInput.checked);
    });
    var shadowText = document.createElement('span');
    shadowText.textContent = '文字描边（浅色字配深色描边更清晰）';
    shadowRow.appendChild(shadowInput);
    shadowRow.appendChild(shadowText);
    panel.appendChild(shadowRow);

    // Wallpaper grid: two large preview tiles per row.
    renderItems();
  }

  // (Re)build only the wallpaper grid, leaving the control rows intact.
  function renderItems() {
    var wrap = panel.querySelector('.we-items');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'we-items';
      panel.appendChild(wrap);
    }
    wrap.innerHTML = '';
    state.list.forEach(function (w) {
      var item = document.createElement('div');
      item.className = 'we-item' + (w.id === (state.list[state.index] && state.list[state.index].id) ? ' active' : '');
      item.dataset.id = w.id;
      item.title = w.title; // title only as a hover tooltip

      // Large preview thumbnail: preview.jpg when the workshop item ships one;
      // otherwise use the video's own first frame as the thumbnail.
      var thumb = document.createElement('span');
      thumb.className = 'we-thumb';
      if (w.preview) {
        var img = document.createElement('img');
        img.src = API + '/media/' + encodeURIComponent(w.id) + '/' + encodeURIComponent(w.preview);
        img.alt = '';
        img.loading = 'lazy';
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
        img.addEventListener('error', function () {
          img.style.display = 'none';
          thumb.textContent = '🎞';
        });
        thumb.appendChild(img);
      } else {
        // No preview.jpg: render the first frame of the actual video.
        // preload="metadata" fetches only the header (HTTP Range), so even
        // multi-GB files stay cheap.
        var vid = document.createElement('video');
        vid.muted = true;
        vid.playsInline = true;
        vid.preload = 'metadata';
        vid.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
        vid.src = API + '/media/' + encodeURIComponent(w.id) + '/' + encodeURIComponent(w.file);
        vid.addEventListener('loadedmetadata', function () {
          try { vid.currentTime = 0.1; } catch (e) {}
        });
        vid.addEventListener('error', function () {
          vid.style.display = 'none';
          thumb.textContent = '🎞';
        });
        thumb.appendChild(vid);
      }
      item.appendChild(thumb);

      // Meta row: duration + size, and the preview button.
      var meta = document.createElement('div');
      meta.className = 'we-meta';
      var size = document.createElement('span');
      var dur = fmtDuration(w.durationSec);
      size.textContent = (dur ? dur + ' · ' : '') + w.sizeMB + 'MB';
      var previewBtn = document.createElement('button');
      previewBtn.type = 'button';
      previewBtn.className = 'we-preview-btn';
      previewBtn.textContent = '预览';
      previewBtn.title = '预览此壁纸';
      previewBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        openPreview(w.id);
      });
      meta.appendChild(size);
      meta.appendChild(previewBtn);
      item.appendChild(meta);

      item.addEventListener('click', function () {
        pick(w.id);
      });
      wrap.appendChild(item);
    });
  }

  // Re-scan the workshop folder: keep the current wallpaper if it still
  // exists, otherwise fall back to the first one.
  function refreshCatalog() {
    var btn = panel.querySelector('#we-bg-refresh .we-refresh-btn');
    if (btn) { btn.disabled = true; btn.textContent = '刷新中…'; }
    fetch(API + '/api/wallpapers')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var prevId = state.list[state.index] && state.list[state.index].id;
        state.list = (data && data.wallpapers) || [];
        var idx = -1;
        if (prevId) {
          for (var i = 0; i < state.list.length; i++) {
            if (state.list[i].id === prevId) { idx = i; break; }
          }
        }
        state.index = idx >= 0 ? idx : (state.list.length ? 0 : -1);
        renderItems();
        if (state.index >= 0) apply();
        if (btn) {
          btn.disabled = false;
          btn.textContent = '✓ 已刷新';
          btn.classList.add('we-refresh-ok');
          setTimeout(function () {
            if (btn) { btn.textContent = '刷新'; btn.classList.remove('we-refresh-ok'); }
          }, 1500);
        }
      })
      .catch(function (err) {
        console.warn('[we-wallpaper] refresh failed:', err);
        if (btn) { btn.disabled = false; btn.textContent = '刷新失败'; }
      });
  }

  function shuffle() {
    if (state.list.length < 2) return;
    var next = state.index;
    while (next === state.index) next = Math.floor(Math.random() * state.list.length);
    state.index = next;
    apply();
  }

  boot();
})();
