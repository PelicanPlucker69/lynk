/* ==========================================================
   LYNK | "Link" between the phone page and the laptop pages
   A tiny message bus so the phone can tell the laptop things
   (like "here is my photo") and the laptop can tell the phone
   things (like "the hunt has started").

   Two routes carry every message (duplicates are ignored):
   1. LOCAL   - other tabs of the same browser (BroadcastChannel).
                Handy for testing with two windows on one computer.
   2. NETWORK - a real phone <-> laptop connection through the LYNK
                server (server/server.js). Both sides join the same
                "session"; the code for it is inside the QR code.

   The rest of the site only uses:
     LynkLink.send(data)              send a message
     LynkLink.on(fn)                  receive messages
     LynkLink.onStatus(fn)            { connected, phones } updates
     LynkLink.getPhoneUrl(callback)   the address the QR code opens
   ========================================================== */
(function () {
  'use strict';

  var CHANNEL = 'lynk-link';
  var KEY = 'lynkLinkMessage';
  var ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

  var listeners = [];
  var statusListeners = [];
  var seen = {};
  var bc = null;

  var isPhone = /phone\.html$/i.test(window.location.pathname);
  var online = /^https?:$/.test(window.location.protocol);   // false when opened as a file

  function safeGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  /* ---------- Who am I talking with? (the session) ---------- */
  function randomId(length) {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    var out = '';
    var bytes = new Uint8Array(length);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < length; i += 1) { bytes[i] = Math.floor(Math.random() * 256); }
    }
    for (var j = 0; j < length; j += 1) { out += chars.charAt(bytes[j] % chars.length); }
    return out;
  }

  var sessionId = null;
  if (isPhone) {
    // The phone gets the session from the QR code: phone.html?s=CODE
    var fromUrl = (window.location.search.match(/[?&]s=([^&#]+)/) || [])[1];
    sessionId = fromUrl && ID_RE.test(fromUrl) ? fromUrl : safeGet('lynkSession');
    if (sessionId) { safeSet('lynkSession', sessionId); }
  } else {
    // The laptop makes one session and keeps it for every page of the game
    sessionId = safeGet('lynkSession');
    if (!sessionId || !ID_RE.test(sessionId)) {
      sessionId = randomId(14);
      safeSet('lynkSession', sessionId);
    }
  }

  var clientId = randomId(12);
  var networked = online && !!sessionId;

  /* ---------- Delivering messages to the page ---------- */
  function deliver(msg) {
    if (!msg || !msg.id || seen[msg.id]) { return; }   // both routes can deliver the same message
    seen[msg.id] = true;
    listeners.forEach(function (fn) {
      try { fn(msg.data); } catch (e) { /* one bad listener must not stop the others */ }
    });
  }

  /* ---------- Route 1: same browser ---------- */
  try {
    if (window.BroadcastChannel) {
      bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = function (event) { deliver(event.data); };
    }
  } catch (e) { bc = null; }

  // Fallback: the "storage" event fires in OTHER tabs when localStorage changes
  window.addEventListener('storage', function (event) {
    if (event.key !== KEY || !event.newValue) { return; }
    try { deliver(JSON.parse(event.newValue)); } catch (e) { /* ignore */ }
  });

  /* ---------- Route 2: the LYNK server ---------- */
  var status = { connected: false, phones: 0 };

  function setStatus(patch) {
    var changed = false;
    Object.keys(patch).forEach(function (k) {
      if (status[k] !== patch[k]) { status[k] = patch[k]; changed = true; }
    });
    if (!changed) { return; }
    statusListeners.forEach(function (fn) {
      try { fn({ connected: status.connected, phones: status.phones }); } catch (e) { /* ignore */ }
    });
  }

  var source = null;

  function connect() {
    if (!networked || !window.EventSource) { return; }
    source = new EventSource('/api/events?s=' + encodeURIComponent(sessionId) +
      '&c=' + encodeURIComponent(clientId) + '&role=' + (isPhone ? 'phone' : 'laptop'));

    source.onopen = function () { setStatus({ connected: true }); };
    source.onerror = function () { setStatus({ connected: false }); };   // the browser reconnects by itself
    source.onmessage = function (event) {
      var msg;
      try { msg = JSON.parse(event.data); } catch (e) { return; }
      if (msg && msg.data && msg.data.type === '_presence') { setStatus({ phones: msg.data.phones || 0 }); }
      deliver(msg);
    };
  }

  function post(msg, attempt) {
    if (!networked) { return; }
    fetch('/api/send?s=' + encodeURIComponent(sessionId) + '&c=' + encodeURIComponent(clientId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg)
    }).then(function (res) {
      if (!res.ok) { throw new Error('send failed'); }
    }).catch(function () {
      if (attempt < 3) { setTimeout(function () { post(msg, attempt + 1); }, 800 * (attempt + 1)); }
    });
  }

  connect();
  window.addEventListener('pagehide', function () { if (source) { source.close(); } });

  /* ---------- What the rest of the site uses ---------- */
  window.LynkLink = {
    sessionId: sessionId,
    networked: networked,

    send: function (data) {
      var msg = { id: Date.now() + '-' + Math.random().toString(36).slice(2), data: data };
      seen[msg.id] = true;                    // don't deliver our own messages back to us
      if (bc) { try { bc.postMessage(msg); } catch (e) { /* ignore */ } }
      try { localStorage.setItem(KEY, JSON.stringify(msg)); localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      post(msg, 0);
    },

    on: function (fn) { listeners.push(fn); },

    onStatus: function (fn) {
      statusListeners.push(fn);
      fn({ connected: status.connected, phones: status.phones });
    },

    /* The address the QR code opens on the phone.
       callback({ url, secure, reason })
         url     the full address (null if there isn't a usable one)
         secure  true for https (phones only allow the camera on https)
         reason  'file' | 'local' | 'lan' when the address is not ideal */
    getPhoneUrl: function (callback) {
      if (!networked) { callback({ url: null, secure: false, reason: 'file' }); return; }

      var here = new URL('phone.html', window.location.href);   // the phone page sits next to this page
      var tail = here.pathname + '?s=' + sessionId;
      var host = window.location.hostname;
      var onThisComputer = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';

      if (!onThisComputer) {
        callback({ url: here.origin + tail, secure: here.protocol === 'https:' });
        return;
      }

      // Opened as "localhost": a phone can't reach that, so ask the server for a better address
      fetch('/api/info').then(function (r) { return r.json(); }).then(function (info) {
        if (info && info.publicUrl) {
          callback({ url: new URL(tail, info.publicUrl).toString(), secure: /^https:/i.test(info.publicUrl) });
        } else if (info && info.lan && info.lan.length) {
          callback({ url: 'http://' + info.lan[0] + ':' + (info.port || window.location.port) + tail, secure: false, reason: 'lan' });
        } else {
          callback({ url: null, secure: false, reason: 'local' });
        }
      }).catch(function () { callback({ url: null, secure: false, reason: 'local' }); });
    }
  };
})();
