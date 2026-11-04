/* ==========================================================
   LYNK | Display settings (cog in the navbar)
   Three accessibility options, remembered between pages:
     - Dark mode          (less glare / photosensitivity)
     - Minimalist UI      (fades out clutter and motion)
     - Soothing colours   (soft blue + muted green palette)
   This file is loaded in the <head> so the saved choices are
   applied before the page paints (no flash of the wrong theme).
   ========================================================== */
(function () {
  'use strict';

  var KEY = 'lynkPrefs';
  var OPTIONS = [
    { id: 'dark',    cls: 'theme-dark',   label: 'Dark mode',
      hint: 'Dim, low-glare screen. Easier on light-sensitive eyes.' },
    { id: 'minimal', cls: 'pref-minimal', label: 'Minimalist UI',
      hint: 'Fades out extras and stops animations so you can focus.' },
    { id: 'calm',    cls: 'pref-calm',    label: 'Soothing colours',
      hint: 'Soft blues and muted greens for a calmer screen.' }
  ];

  var root = document.documentElement;
  var prefs = load();

  function load() {
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || '{}');
      return saved && typeof saved === 'object' ? saved : {};
    } catch (e) { return {}; }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ }
  }

  function apply() {
    OPTIONS.forEach(function (o) { root.classList.toggle(o.cls, !!prefs[o.id]); });
  }

  apply();   // runs immediately (script is in the <head>)

  /* ---------- Build the cog + menu once the page exists ---------- */
  function build() {
    var host = document.querySelector('.site-header .nav-actions') || document.querySelector('.site-header .nav');
    if (!host || document.getElementById('lkSettingsBtn')) { return; }

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'lkSettingsBtn';
    btn.className = 'lk-cog';
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'lkSettingsPanel');
    btn.setAttribute('aria-label', 'Display settings');
    btn.title = 'Display settings';
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="3"/>' +
      '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>' +
      '</svg>';
    host.appendChild(btn);

    var panel = document.createElement('div');
    panel.id = 'lkSettingsPanel';
    panel.className = 'lk-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Display settings');
    panel.hidden = true;

    var html = '<div class="lk-panel-head"><h2 class="lk-panel-title">Display settings</h2>' +
      '<button type="button" class="lk-close" aria-label="Close settings">&times;</button></div>' +
      '<ul class="lk-list">';
    OPTIONS.forEach(function (o) {
      html += '<li class="lk-row">' +
        '<div class="lk-row-text"><p class="lk-row-label" id="lk-l-' + o.id + '">' + o.label + '</p>' +
        '<p class="lk-row-hint" id="lk-h-' + o.id + '">' + o.hint + '</p></div>' +
        '<button type="button" class="lk-switch" role="switch" data-opt="' + o.id + '" ' +
        'aria-labelledby="lk-l-' + o.id + '" aria-describedby="lk-h-' + o.id + '" aria-checked="false"><span class="lk-knob"></span></button>' +
        '</li>';
    });
    html += '</ul><button type="button" class="lk-reset">Reset to default</button>';
    panel.innerHTML = html;
    document.body.appendChild(panel);

    function sync() {
      Array.prototype.forEach.call(panel.querySelectorAll('.lk-switch'), function (sw) {
        sw.setAttribute('aria-checked', String(!!prefs[sw.getAttribute('data-opt')]));
      });
    }

    function open() {
      panel.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      sync();
      var first = panel.querySelector('.lk-switch');
      if (first) { first.focus(); }
    }

    function close(returnFocus) {
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (returnFocus) { btn.focus(); }
    }

    btn.addEventListener('click', function () { if (panel.hidden) { open(); } else { close(false); } });
    panel.querySelector('.lk-close').addEventListener('click', function () { close(true); });

    panel.addEventListener('click', function (e) {
      var sw = e.target.closest ? e.target.closest('.lk-switch') : null;
      if (sw) {
        var id = sw.getAttribute('data-opt');
        prefs[id] = !prefs[id];
        save(); apply(); sync();
      }
      if (e.target.closest && e.target.closest('.lk-reset')) {
        prefs = {};
        save(); apply(); sync();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) { close(true); }
    });

    document.addEventListener('click', function (e) {
      if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) { close(false); }
    });

    // Keep other open tabs in step with this one
    window.addEventListener('storage', function (e) {
      if (e.key === KEY) { prefs = load(); apply(); sync(); }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
