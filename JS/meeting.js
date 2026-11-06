/* ==========================================================
   LYNK | Meeting page behaviour
   - live clock + meeting length
   - mic / camera toggles (update your own tile)
   - working chat + live captions tab (real microphone via the browser's speech recognition)
   - "Are you ready for an activity?" confirm
   ========================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var YOU = 'Bobby'; // you are the host in this prototype

  /* ---------- Safe sessionStorage (shared between pages) ---------- */
  function readStore(key) {
    try { return sessionStorage.getItem(key); } catch (e) { return null; }
  }

  function writeStore(key, value) {
    try { sessionStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }

  function clearStore() {
    try {
      sessionStorage.removeItem('lynkMeetingStart');
      sessionStorage.removeItem('lynkHuntSeconds');
      sessionStorage.removeItem('lynkObjective');
      sessionStorage.removeItem('lynkR1Seconds');
      sessionStorage.removeItem('lynkR1Objective');
      sessionStorage.removeItem('lynkR2Seconds');
      sessionStorage.removeItem('lynkR2Objective');
      sessionStorage.removeItem('lynkCaptions');
      sessionStorage.removeItem('lynkMicOff');
      sessionStorage.removeItem('lynkCamOff');
    } catch (e) { /* ignore */ }
  }

  /* ---------- Clock + meeting length ---------- */
  var clockEl = $('clock');
  var elapsedEl = $('elapsed');
  var startedAt = Number(readStore('lynkMeetingStart'));
  if (!startedAt) {
    startedAt = Date.now();
    writeStore('lynkMeetingStart', String(startedAt));
  }

  function formatTime(date) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function formatLength(ms) {
    var mins = Math.floor(ms / 60000);
    if (mins < 60) { return mins + ' min'; }
    var hrs = Math.floor(mins / 60);
    return hrs + (hrs === 1 ? ' hour' : ' hours') + ' & ' + (mins % 60) + ' min';
  }

  function tick() {
    clockEl.textContent = formatTime(new Date());
    elapsedEl.textContent = formatLength(Date.now() - startedAt);
  }

  tick();
  setInterval(tick, 1000);

  /* ---------- Toast ---------- */
  var toastEl = $('toast');
  var toastTimer;

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('show');
    }, 2400);
  }

  /* ---------- Chat ---------- */
  var chatLog = $('chatLog');
  var chatForm = $('chatForm');
  var chatInput = $('chatInput');

  function addMessage(name, text, options) {
    options = options || {};
    var when = options.time || new Date();

    var msg = document.createElement('div');
    msg.className = 'm-msg' + (options.system ? ' is-system' : '');

    var head = document.createElement('div');
    head.className = 'm-msg-head';

    var nameEl = document.createElement('span');
    nameEl.className = 'm-msg-name';
    nameEl.textContent = name;

    var timeEl = document.createElement('span');
    timeEl.className = 'm-msg-time';
    timeEl.textContent = formatTime(when);

    head.appendChild(nameEl);
    head.appendChild(timeEl);

    var body = document.createElement('p');
    body.className = 'm-msg-text';
    body.textContent = text; // textContent keeps user input safe

    msg.appendChild(head);
    msg.appendChild(body);
    chatLog.appendChild(msg);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  // Starter messages (times are relative to "now" so they always look current)
  var seed = [
    { name: 'System',    text: 'The host is preparing an activity. Are we ready for an activity? 🏃', ago: 5, system: true },
    { name: 'Bobby',     text: 'Let’s get started everyone! 👋', ago: 5 },
    { name: 'Alex K.',   text: 'Ready! Sharing my screen now.', ago: 4 },
    { name: 'Jordan T.', text: 'Can everyone see the dashboard?', ago: 3 },
    { name: 'Morgan P.', text: 'Yes, looks good!', ago: 3 }
  ];

  seed.forEach(function (m) {
    addMessage(m.name, m.text, {
      system: m.system,
      time: new Date(Date.now() - m.ago * 60000)
    });
  });

  chatForm.addEventListener('submit', function (event) {
    event.preventDefault();
    var text = chatInput.value.trim();
    if (!text) { return; }
    addMessage(YOU, text);
    chatInput.value = '';
    chatInput.focus();
  });

  var selfTile = $('selfTile');
  var micBtn = $('micBtn');
  var camBtn = $('camBtn');

  /* ---------- Tabs: Meeting Chat / Live Captions ---------- */
  var tabChat = $('tabChat');
  var tabCaps = $('tabCaps');
  var paneChat = $('paneChat');
  var paneCaps = $('paneCaps');

  function selectTab(which) {
    var caps = which === 'caps';
    tabChat.classList.toggle('is-active', !caps);
    tabCaps.classList.toggle('is-active', caps);
    tabChat.setAttribute('aria-selected', String(!caps));
    tabCaps.setAttribute('aria-selected', String(caps));
    tabChat.tabIndex = caps ? -1 : 0;
    tabCaps.tabIndex = caps ? 0 : -1;
    paneChat.hidden = caps;
    paneCaps.hidden = !caps;
    if (caps) { capLog.scrollTop = capLog.scrollHeight; }
  }

  tabChat.addEventListener('click', function () { selectTab('chat'); });
  tabCaps.addEventListener('click', function () { selectTab('caps'); });
  [tabChat, tabCaps].forEach(function (tab) {
    tab.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        var next = (tab === tabChat) ? 'caps' : 'chat';
        selectTab(next);
        (next === 'caps' ? tabCaps : tabChat).focus();
      }
    });
  });

  /* ---------- Live captions ---------- */
  var capLog = $('capLog');
  var capStatus = $('capStatus');
  var capStatusText = $('capStatusText');
  var interimEl = null;

  function addCaption(name, text, options) {
    options = options || {};
    var nearBottom = capLog.scrollHeight - capLog.scrollTop - capLog.clientHeight < 40;

    var msg = document.createElement('div');
    msg.className = 'm-msg' + (options.you ? ' is-you' : '') + (options.interim ? ' is-interim' : '');

    var head = document.createElement('div');
    head.className = 'm-msg-head';
    var nameEl = document.createElement('span');
    nameEl.className = 'm-msg-name';
    nameEl.textContent = name;
    var timeEl = document.createElement('span');
    timeEl.className = 'm-msg-time';
    timeEl.textContent = formatTime(options.time || new Date());
    head.appendChild(nameEl);
    head.appendChild(timeEl);

    var body = document.createElement('p');
    body.className = 'm-msg-text';
    body.textContent = text;

    msg.appendChild(head);
    msg.appendChild(body);
    capLog.appendChild(msg);

    // Follow new captions, but don't yank the page if someone is reading older ones
    if (nearBottom || options.forceScroll) { capLog.scrollTop = capLog.scrollHeight; }
    return msg;
  }

  /* Pretend transcript from before you spoke (made-up for the prototype) */
  var capSeed = [
    { name: 'Bobby',     ago: 6, text: 'Okay, I think everyone has joined, so let’s get started.' },
    { name: 'Alex K.',   ago: 6, text: 'Morning all. Can you hear me alright?' },
    { name: 'Bobby',     ago: 5, text: 'Loud and clear, Alex. Thanks for sharing the agenda earlier.' },
    { name: 'Jordan T.', ago: 5, text: 'I’ve got the quarterly numbers ready whenever we want to go through them.' },
    { name: 'Morgan P.', ago: 4, text: 'Great. Before that, does anyone have updates on the client feedback?' },
    { name: 'Alex K.',   ago: 4, text: 'Yes, they were really happy with the prototype. A couple of small changes to the layout, nothing major.' },
    { name: 'Jordan T.', ago: 3, text: 'That’s good news. I’ll put the changes into the tracker after this call.' },
    { name: 'Morgan P.', ago: 3, text: 'Perfect. We’ve been sitting for a while, so after the next item let’s do the movement break.' },
    { name: 'Bobby',     ago: 2, text: 'Good idea, Morgan. I’ll start the activity once we finish the dashboard.' },
    { name: 'Alex K.',   ago: 2, text: 'Sounds good. I’ll stop sharing my screen in a minute.' }
  ];

  capSeed.forEach(function (c) {
    addCaption(c.name, c.text, { time: new Date(Date.now() - c.ago * 60000), you: c.name === YOU });
  });

  // Things you said earlier in this meeting (kept while you move between pages)
  var savedCaps = [];
  try { savedCaps = JSON.parse(readStore('lynkCaptions') || '[]'); } catch (e) { savedCaps = []; }
  if (!Array.isArray(savedCaps)) { savedCaps = []; }
  savedCaps.forEach(function (c) {
    addCaption(YOU, c.text, { time: new Date(c.t), you: true });
  });
  capLog.scrollTop = capLog.scrollHeight;

  function saveCaption(text) {
    savedCaps.push({ text: text, t: Date.now() });
    if (savedCaps.length > 40) { savedCaps.shift(); }
    writeStore('lynkCaptions', JSON.stringify(savedCaps));
  }

  function setCapStatus(text, listening) {
    capStatusText.textContent = text;
    capStatus.classList.toggle('is-listening', !!listening);
  }

  /* ---------- Microphone + speech-to-text ----------
     Uses the browser's built-in Web Speech API (no plugins). It works in
     Chrome, Edge and Safari over https or localhost. Firefox doesn't have it. */
  var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recognition = null;
  var micWanted = false;       // is the mic switched on in the app?
  var micBlocked = false;      // did the browser say no?
  var restartTimer = null;
  var failCount = 0;

  function clearInterim() {
    if (interimEl && interimEl.parentNode) { interimEl.parentNode.removeChild(interimEl); }
    interimEl = null;
    selfTile.classList.remove('is-speaking');
  }

  function showInterim(text) {
    if (!interimEl) { interimEl = addCaption(YOU, text, { you: true, interim: true }); }
    else { interimEl.querySelector('.m-msg-text').textContent = text; }
    if (capLog.scrollHeight - capLog.scrollTop - capLog.clientHeight < 80) { capLog.scrollTop = capLog.scrollHeight; }
    selfTile.classList.add('is-speaking');
  }

  function buildRecognition() {
    var rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-US';

    rec.onstart = function () {
      failCount = 0;
      setCapStatus('Mic is on. Captions are listening to you.', true);
    };

    rec.onresult = function (event) {
      var interim = '';
      for (var i = event.resultIndex; i < event.results.length; i += 1) {
        var result = event.results[i];
        var text = result[0].transcript.trim();
        if (result.isFinal) {
          clearInterim();
          if (text) {
            addCaption(YOU, text, { you: true, forceScroll: true });
            saveCaption(text);
          }
        } else {
          interim += result[0].transcript;
        }
      }
      if (interim.trim()) { showInterim(interim.trim()); }
    };

    rec.onerror = function (event) {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        micBlocked = true;
        setCapStatus('Microphone access was blocked. Allow it in your browser’s address bar, then turn the mic off and on.', false);
      } else if (event.error === 'audio-capture') {
        micBlocked = true;
        setCapStatus('No microphone was found. Plug one in, then turn the mic off and on.', false);
      } else if (event.error === 'network') {
        setCapStatus('Captions need an internet connection. Trying again…', false);
      }
      // "no-speech" and "aborted" are normal: the browser just stops after silence
    };

    rec.onend = function () {
      clearInterim();
      // Browsers stop listening after a pause, so keep it going while the mic is on
      if (micWanted && !micBlocked) {
        failCount += 1;
        clearTimeout(restartTimer);
        restartTimer = setTimeout(startListening, Math.min(300 * failCount, 3000));
      }
    };

    return rec;
  }

  function startListening() {
    if (!micWanted || micBlocked || !SpeechRec) { return; }
    try {
      if (!recognition) { recognition = buildRecognition(); }
      recognition.start();
    } catch (e) { /* already running */ }
  }

  function stopListening() {
    micWanted = false;
    clearTimeout(restartTimer);
    clearInterim();
    if (recognition) { try { recognition.stop(); } catch (e) { /* ignore */ } }
  }

  /* Switch the real microphone on/off to match the Mic button */
  function applyMic(on) {
    if (!SpeechRec) {
      setCapStatus(on ? 'Live captions of your voice need Chrome, Edge or Safari. The call captions above still work.' : 'Mic is muted.', false);
      return;
    }
    if (on) {
      micWanted = true;
      micBlocked = false;
      failCount = 0;
      setCapStatus('Starting microphone…', false);
      startListening();
    } else {
      stopListening();
      setCapStatus('You are muted. Unmute to have your speech captioned.', false);
    }
  }

  window.addEventListener('pagehide', stopListening);

  /* ---------- Mic / camera toggles ---------- */

  function toggle(btn, onChange) {
    btn.addEventListener('click', function () {
      var nowOn = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', String(nowOn));
      btn.classList.toggle('is-off', !nowOn);
      onChange(nowOn);
    });
  }

  toggle(micBtn, function (on) {
    selfTile.classList.toggle('is-muted', !on);
    writeStore('lynkMicOff', on ? '0' : '1');
    applyMic(on);
    toast(on ? 'Microphone on' : 'Microphone muted');
  });

  toggle(camBtn, function (on) {
    selfTile.classList.toggle('is-cam-off', !on);
    writeStore('lynkCamOff', on ? '0' : '1');
    if (window.LynkCamera) { window.LynkCamera.setCam(on); }
    toast(on ? 'Camera on' : 'Camera off');
  });

  // If you muted / turned off your camera on another page, keep it that way here
  function restoreOff(btn, tileClass, key) {
    if (readStore(key) === '1') {
      btn.setAttribute('aria-pressed', 'false');
      btn.classList.add('is-off');
      selfTile.classList.add(tileClass);
    }
  }

  restoreOff(micBtn, 'is-muted', 'lynkMicOff');
  restoreOff(camBtn, 'is-cam-off', 'lynkCamOff');

  // Start (or stay off) to match the saved mic state
  applyMic(readStore('lynkMicOff') !== '1');

  /* ---------- Other control buttons ---------- */
  $('chatBtn').addEventListener('click', function () {
    selectTab('chat');
    $('chatPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    chatInput.focus();
  });

  $('peopleBtn').addEventListener('click', function () {
    var count = document.querySelectorAll('.m-person').length;
    toast(count + ' participants in this meeting');
  });

  $('shareBtn').addEventListener('click', function () {
    toast('Screen sharing is coming in a later version');
  });

  $('moreBtn').addEventListener('click', function () {
    toast('More options are coming in a later version');
  });

  /* ---------- Leaving ends the meeting ---------- */
  var leaveLink = document.querySelector('.m-leave');
  if (leaveLink) { leaveLink.addEventListener('click', clearStore); }

  /* ---------- Activity prompt ---------- */
  var confirmBtn = $('confirmBtn');
  var activityNote = $('activityNote');

  confirmBtn.addEventListener('click', function () {
    if (confirmBtn.classList.contains('is-confirmed')) { return; }

    confirmBtn.classList.add('is-confirmed');
    confirmBtn.textContent = 'Ready ✓';
    confirmBtn.setAttribute('aria-disabled', 'true');
    activityNote.hidden = false;

    addMessage('System', YOU + ' is ready for the activity ✅', { system: true });

    // Give the "Ready" state a moment to show, then head to the game rules
    setTimeout(function () {
      window.location.href = 'game.html';
    }, 900);
  });
})();