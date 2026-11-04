/* ==========================================================
   LYNK | Live captions bar for the game and results pages
   - Shows what people say during the game as text (for deaf and
     hard-of-hearing players), docked at the bottom of the page.
   - Your own microphone is captioned with the browser's built-in
     speech recognition (Chrome, Edge, Safari; needs https or localhost).
   - The other players' lines are made-up for the prototype.
   - game.js / results.js call LynkCaptions.setMic(true/false) when the
     Mic button is pressed.
   ========================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var YOU = 'Bobby';

  var bar = $('ccBar');
  var log = $('ccLog');
  if (!bar || !log) { return; }

  var statusEl = $('ccStatus');
  var toggleBtn = $('ccToggle');
  var selfTile = $('selfTile');

  /* ---------- Safe sessionStorage ---------- */
  function read(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function write(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  /* ---------- Caption lines ---------- */
  var MAX_LINES = 60;
  var interimEl = null;

  function addLine(name, text, options) {
    options = options || {};
    var nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;

    var line = document.createElement('p');
    line.className = 'cc-line' + (options.you ? ' is-you' : '') + (options.interim ? ' is-interim' : '');

    var who = document.createElement('span');
    who.className = 'cc-name';
    who.textContent = name + ':';
    line.appendChild(who);
    line.appendChild(document.createTextNode(' ' + text));

    log.appendChild(line);
    while (log.children.length > MAX_LINES) { log.removeChild(log.firstChild); }

    if (nearBottom || options.forceScroll) { log.scrollTop = log.scrollHeight; }
    return line;
  }

  /* What was being said just before (made-up) */
  [
    { name: 'Alex K.',   text: 'Okay, I’m ready. Where’s my phone?' },
    { name: 'Morgan P.', text: 'Haha, same. Let’s see what we have to find this time.' },
    { name: 'Jordan T.', text: 'Good luck everyone, may the fastest person win!' }
  ].forEach(function (c) { addLine(c.name, c.text); });

  // Things you said earlier in this meeting
  var saved = [];
  try { saved = JSON.parse(read('lynkCaptions') || '[]'); } catch (e) { saved = []; }
  if (!Array.isArray(saved)) { saved = []; }
  saved.slice(-5).forEach(function (c) { addLine(YOU, c.text, { you: true }); });
  log.scrollTop = log.scrollHeight;

  function saveLine(text) {
    saved.push({ text: text, t: Date.now() });
    if (saved.length > 40) { saved.shift(); }
    write('lynkCaptions', JSON.stringify(saved));
  }

  /* Made-up chatter from the others every so often, so it feels live */
  var CHATTER = [
    ['Alex K.',   'Found something already, taking a photo now!'],
    ['Jordan T.', 'Ha, this one is trickier than it looks.'],
    ['Morgan P.', 'I’m running to the kitchen, back in a second.'],
    ['Alex K.',   'Is a banana cheating? Asking for a friend.'],
    ['Jordan T.', 'Almost there, I can see it!'],
    ['Morgan P.', 'No way, you’re all so fast.'],
    ['Alex K.',   'Okay, photo submitted. Come on, you two!'],
    ['Jordan T.', 'That was fun. Round two, let’s go.']
  ];
  var chatterIndex = 0;

  function scheduleChatter() {
    setTimeout(function () {
      var c = CHATTER[chatterIndex % CHATTER.length];
      chatterIndex += 1;
      addLine(c[0], c[1]);
      scheduleChatter();
    }, 7000 + Math.round(Math.random() * 6000));
  }
  scheduleChatter();

  /* ---------- Show / hide ---------- */
  function setHidden(hidden) {
    bar.classList.toggle('is-collapsed', hidden);
    toggleBtn.setAttribute('aria-expanded', String(!hidden));
    toggleBtn.textContent = hidden ? 'Show' : 'Hide';
    write('lynkCcHidden', hidden ? '1' : '0');
    if (!hidden) { log.scrollTop = log.scrollHeight; }
  }

  toggleBtn.addEventListener('click', function () {
    setHidden(!bar.classList.contains('is-collapsed'));
  });
  setHidden(read('lynkCcHidden') === '1');

  /* ---------- Microphone + speech-to-text ---------- */
  var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recognition = null;
  var micWanted = false;
  var micBlocked = false;
  var restartTimer = null;
  var failCount = 0;

  function setStatus(text, listening) {
    statusEl.textContent = text;
    bar.classList.toggle('is-listening', !!listening);
  }

  function clearInterim() {
    if (interimEl && interimEl.parentNode) { interimEl.parentNode.removeChild(interimEl); }
    interimEl = null;
    if (selfTile) { selfTile.classList.remove('is-speaking'); }
  }

  function showInterim(text) {
    if (!interimEl) { interimEl = addLine(YOU, text, { you: true, interim: true }); }
    else {
      interimEl.lastChild.nodeValue = ' ' + text;
    }
    if (log.scrollHeight - log.scrollTop - log.clientHeight < 80) { log.scrollTop = log.scrollHeight; }
    if (selfTile) { selfTile.classList.add('is-speaking'); }
  }

  function build() {
    var rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-US';

    rec.onstart = function () {
      failCount = 0;
      setStatus('Listening to you', true);
    };

    rec.onresult = function (event) {
      var interim = '';
      for (var i = event.resultIndex; i < event.results.length; i += 1) {
        var result = event.results[i];
        var text = result[0].transcript.trim();
        if (result.isFinal) {
          clearInterim();
          if (text) {
            addLine(YOU, text, { you: true, forceScroll: true });
            saveLine(text);
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
        setStatus('Microphone blocked. Allow it in your browser, then mute and unmute.', false);
      } else if (event.error === 'audio-capture') {
        micBlocked = true;
        setStatus('No microphone found.', false);
      } else if (event.error === 'network') {
        setStatus('Captions need an internet connection.', false);
      }
    };

    rec.onend = function () {
      clearInterim();
      if (micWanted && !micBlocked) {
        failCount += 1;
        clearTimeout(restartTimer);
        restartTimer = setTimeout(start, Math.min(300 * failCount, 3000));
      }
    };

    return rec;
  }

  function start() {
    if (!micWanted || micBlocked || !SpeechRec) { return; }
    try {
      if (!recognition) { recognition = build(); }
      recognition.start();
    } catch (e) { /* already running */ }
  }

  function stop() {
    micWanted = false;
    clearTimeout(restartTimer);
    clearInterim();
    if (recognition) { try { recognition.stop(); } catch (e) { /* ignore */ } }
  }

  function setMic(on) {
    if (!SpeechRec) {
      setStatus(on ? 'Your voice can’t be captioned in this browser (try Chrome, Edge or Safari)' : 'Muted', false);
      return;
    }
    if (on) {
      micWanted = true;
      micBlocked = false;
      failCount = 0;
      setStatus('Starting microphone…', false);
      start();
    } else {
      stop();
      setStatus('You are muted', false);
    }
  }

  window.LynkCaptions = { setMic: setMic };
  window.addEventListener('pagehide', stop);

  // Match the Mic button state saved from the other pages
  setMic(read('lynkMicOff') !== '1');
})();