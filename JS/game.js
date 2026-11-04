/* ==========================================================
   LYNK | Game page behaviour (self-contained)
   1. Rules screen  -> player presses "Are you ready?"
   2. Countdown     -> 10 down to 1
   3. Objective     -> what to go and find + a running timer
   4. "Next"        -> pretends the photo was submitted from the
                       phone and moves on to the results page
   The game is played in 2 rounds. Round 2 is opened from the
   results page as game.html?round=2 and skips the rules screen.
   ========================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- Settings you can tweak ---------- */
  var COUNT_FROM = 5;          // countdown starts at this number
  var READY_DELAY_MS = 1200;    // pause between "Ready" and the countdown
  var TOTAL_PLAYERS = 4;
  var TOTAL_ROUNDS = 2;         // how many rounds make up one game
  var RING_LENGTH = 553;        // circumference of the countdown ring (2 * PI * 88)

  /* The scavenger hunt objectives. They are fixed so the demo always plays the same way:
     round 1 = drink bottle, round 2 = pen. (OBJECTIVES[round - 1] is used.) */
  var OBJECTIVES = [
    { title: 'Find a drink bottle', lead: 'Find a', name: 'DRINK BOTTLE', noun: 'drink bottle',
      hint: 'Any drink bottle counts: a water bottle, sports bottle or juice bottle.',
      icon: '#o-bottle', swatch: '#2F8FE0' },
    { title: 'Find a pen', lead: 'Find a', name: 'PEN', noun: 'pen',
      hint: 'Any pen counts: a biro, a gel pen, a felt-tip or a marker.',
      icon: '#o-pen', swatch: '#28328C' }
  ];

  /* ---------- Safe sessionStorage (shared between pages) ---------- */
  var store = {
    get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } },
    remove: function (k) { try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };

  /* ---------- Which round is this? ---------- */
  // game.html = round 1 (a fresh game), game.html?round=2 = round 2
  var roundMatch = window.location.search.match(/[?&]round=(\d+)/);
  var round = roundMatch ? Math.min(TOTAL_ROUNDS, Math.max(1, Number(roundMatch[1]))) : 1;

  // A fresh game forgets the scores of any earlier game
  if (round === 1) {
    store.remove('lynkR1Seconds');
    store.remove('lynkR1Objective');
    store.remove('lynkR2Seconds');
    store.remove('lynkR2Objective');
    store.remove('lynkR1Photo');
    store.remove('lynkR2Photo');
  }

  /* ---------- Clock + meeting length ---------- */
  var clockEl = $('clock');
  var elapsedEl = $('elapsed');
  var startedAt = Number(store.get('lynkMeetingStart'));
  if (!startedAt) {
    startedAt = Date.now();
    store.set('lynkMeetingStart', String(startedAt));
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

  /* ---------- Control bar ---------- */
  function toggle(btn, onChange) {
    btn.addEventListener('click', function () {
      var nowOn = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', String(nowOn));
      btn.classList.toggle('is-off', !nowOn);
      onChange(nowOn);
    });
  }

  var selfTile = $('selfTile');
  var micBtn = $('micBtn');
  var camBtn = $('camBtn');

  toggle(micBtn, function (on) {
    selfTile.classList.toggle('is-muted', !on);
    store.set('lynkMicOff', on ? '0' : '1');
    if (window.LynkCaptions) { window.LynkCaptions.setMic(on); }
    toast(on ? 'Microphone on' : 'Microphone muted');
  });

  toggle(camBtn, function (on) {
    selfTile.classList.toggle('is-cam-off', !on);
    store.set('lynkCamOff', on ? '0' : '1');
    if (window.LynkCamera) { window.LynkCamera.setCam(on); }
    toast(on ? 'Camera on' : 'Camera off');
  });

  // If you muted / turned off your camera on an earlier page, keep it that way here
  function restoreOff(btn, tileClass, key) {
    if (store.get(key) === '1') {
      btn.setAttribute('aria-pressed', 'false');
      btn.classList.add('is-off');
      selfTile.classList.add(tileClass);
    }
  }

  restoreOff(micBtn, 'is-muted', 'lynkMicOff');
  restoreOff(camBtn, 'is-cam-off', 'lynkCamOff');

  $('shareBtn').addEventListener('click', function () { toast('Screen sharing is coming in a later version'); });
  $('chatBtn').addEventListener('click', function () { toast('Chat is paused during the game'); });
  $('moreBtn').addEventListener('click', function () { toast('More options are coming in a later version'); });
  $('peopleBtn').addEventListener('click', function () { toast(TOTAL_PLAYERS + ' participants in this meeting'); });

  // Leaving ends the meeting, so forget everything we stored
  $('leaveLink').addEventListener('click', function () {
    store.remove('lynkMeetingStart');
    store.remove('lynkHuntSeconds');
    store.remove('lynkObjective');
    store.remove('lynkR1Seconds');
    store.remove('lynkR1Objective');
    store.remove('lynkR2Seconds');
    store.remove('lynkR2Objective');
    store.remove('lynkR1Photo');
    store.remove('lynkR2Photo');
    store.remove('lynkMicOff');
    store.remove('lynkCamOff');
  });

  /* ---------- Switching between the three screens ---------- */
  var views = {
    rules: $('viewRules'),
    countdown: $('viewCountdown'),
    hunt: $('viewHunt')
  };

  function showView(name) {
    Object.keys(views).forEach(function (key) {
      views[key].hidden = key !== name;
    });

    // The other participants show on every screen except the rules:
    //   countdown -> a row centred under the countdown
    //   hunt      -> a small block at the left
    $('rail').hidden = name === 'rules';
    $('gameCard').classList.toggle('has-rail', name === 'hunt');
    $('gameCard').classList.toggle('has-rail-below', name === 'countdown');
    // Move focus to the new heading so screen readers announce the change
    var heading = views[name].querySelector('[tabindex="-1"]');
    if (heading) { heading.focus({ preventScroll: true }); }
  }

  var statusPill = $('statusPill');

  /* ---------- 1. Ready up ---------- */
  var readyBtn = $('readyBtn');
  var readyNum = $('readyNum');

  readyBtn.addEventListener('click', function () {
    if (readyBtn.classList.contains('is-ready')) { return; }

    readyBtn.classList.add('is-ready');
    readyBtn.setAttribute('aria-disabled', 'true');
    readyBtn.textContent = 'Ready ✓';
    readyNum.textContent = String(TOTAL_PLAYERS); // you were the last one everyone was waiting for

    setTimeout(startCountdown, READY_DELAY_MS);
  });

  /* ---------- 2. Countdown ---------- */
  var countNum = $('countNum');
  var ringBar = $('ringBar');
  var countLive = $('countLive');
  var countTimer;

  function renderCount(n) {
    countNum.textContent = String(n);

    // The ring slowly empties as the numbers go down
    ringBar.style.strokeDashoffset = String(RING_LENGTH * (COUNT_FROM - n) / COUNT_FROM);

    // Re-trigger the little "pop" animation
    countNum.classList.remove('is-pop');
    void countNum.offsetWidth;
    countNum.classList.add('is-pop');

    // Only announce some numbers to screen readers so it isn't noisy
    if (n === COUNT_FROM) {
      countLive.textContent = 'Hunt starting in ' + COUNT_FROM + ' seconds';
    } else if (n === 5 || n <= 3) {
      countLive.textContent = String(n);
    }
  }

  function startCountdown() {
    // Phone buzzes: "Get ready for the game!"
    if (window.LynkLink) { window.LynkLink.send({ type: 'countdown', round: round }); }
    statusPill.textContent = 'Status: Scavenger Hunt';
    $('countKicker').textContent = 'Round ' + round + ' of ' + TOTAL_ROUNDS + ' \u00B7 Everyone\u2019s ready!';
    showView('countdown');

    var n = COUNT_FROM;
    renderCount(n);

    countTimer = setInterval(function () {
      n -= 1;
      if (n < 1) {
        clearInterval(countTimer);
        startHunt();
        return;
      }
      renderCount(n);
    }, 1000);
  }

  /* ---------- 3. The objective ---------- */
  var huntStartedAt = 0;
  var huntTimer;

  function formatStopwatch(totalSeconds) {
    var m = Math.floor(totalSeconds / 60);
    var s = totalSeconds % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function startHunt() {
    // Fixed order: round 1 is the drink bottle, round 2 is the pen
    var objective = OBJECTIVES[Math.min(round, OBJECTIVES.length) - 1];
    store.set('lynkR' + round + 'Objective', objective.title);
    store.remove('lynkR' + round + 'Photo');

    // Tell the phone page (same browser for now) what to go and find
    if (window.LynkLink) {
      window.LynkLink.send({
        type: 'hunt', round: round,
        objective: { title: objective.title, color: objective.swatch || '#30E4B6' }
      });
    }

    $('huntRound').textContent = 'Round ' + round + ' of ' + TOTAL_ROUNDS;

    $('objLead').textContent = objective.lead;
    $('objTitle').textContent = objective.name;
    $('objHint').textContent = objective.hint;
    $('objUse').setAttribute('href', objective.icon);
    $('huntSub').textContent = 'Find the ' + objective.noun + ', take a photo of it on your phone, and submit it as fast as you can.';
    $('stepFind').textContent = 'Find the ' + objective.noun + ' and take a photo';

    showView('hunt');

    // Phones that support it will buzz when the hunt begins
    try { if (navigator.vibrate) { navigator.vibrate([200, 100, 200]); } } catch (e) { /* ignore */ }

    huntStartedAt = Date.now();
    var timeEl = $('huntTime');
    huntTimer = setInterval(function () {
      timeEl.textContent = formatStopwatch(Math.floor((Date.now() - huntStartedAt) / 1000));
    }, 1000);
  }

  /* ---------- QR code: scan it to open the phone page on a real phone ---------- */
  var qrBoxes = document.querySelectorAll('[data-qr]');

  if (qrBoxes.length && window.LynkLink && window.LynkQR) {
    window.LynkLink.getPhoneUrl(function (info) {
      Array.prototype.forEach.call(qrBoxes, function (box) {
        var code = box.querySelector('[data-qr-code]');
        var caption = box.querySelector('.g-qr-cap');
        var copyBtn = box.parentNode.querySelector('[data-qr-copy]');
        box.hidden = false;

        if (!info.url) {
          // Not running through the LYNK server, or only on "localhost": explain what to do
          box.classList.add('is-missing');
          code.textContent = '';
          caption.textContent = info.reason === 'file'
            ? 'No QR code yet: open the site through the LYNK server (npm start).'
            : 'No QR code yet: open this page from your public https address.';
          return;
        }

        code.innerHTML = window.LynkQR.svg(info.url, { label: 'QR code. Scan it with your phone to open LYNK.' });
        box.setAttribute('data-url', info.url);
        if (info.secure === false) {
          caption.textContent = 'Scan with your phone (https needed for camera)';
        }

        copyBtn.hidden = false;
        copyBtn.addEventListener('click', function () {
          function done() {
            copyBtn.textContent = 'Link copied';
            setTimeout(function () { copyBtn.textContent = 'Can\u2019t scan? Copy the link'; }, 1600);
          }
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(info.url).then(done, function () { /* ignore */ });
          }
        });
      });
    });

    // "Waiting for your phone..." turns into "Phone connected" when someone scans
    window.LynkLink.onStatus(function (state) {
      Array.prototype.forEach.call(document.querySelectorAll('[data-qr-status]'), function (el) {
        el.textContent = state.phones > 0 ? '\u2713 Phone connected'
          : (state.connected ? 'Waiting for phone\u2026' : 'Connecting\u2026');
        el.classList.toggle('is-on', state.phones > 0);
      });
    });
  }

  /* ---------- 4. Photo submitted from the phone (or Continue to skip the photo) ---------- */
  var finished = false;

  function finishHunt(photo) {
    if (finished) { return; }
    finished = true;
    clearInterval(huntTimer);
    var seconds = Math.max(1, Math.round((Date.now() - huntStartedAt) / 1000));
    store.set('lynkR' + round + 'Seconds', String(seconds));
    if (photo) { store.set('lynkR' + round + 'Photo', photo); }
    window.location.href = 'results.html?round=' + round;
  }

  $('nextBtn').addEventListener('click', function () { finishHunt(''); });

  // The phone sends the photo as soon as it is submitted
  if (window.LynkLink) {
    window.LynkLink.on(function (msg) {
      if (msg && msg.type === 'photo' && msg.round === round && !views.hunt.hidden && msg.photo) {
        finishHunt(msg.photo);
      }
    });
  }

  /* ---------- Skip round 2: go straight to the podium using round 1 scores ---------- */
  var skipBtn = $('skipBtn');
  if (round > 1) {
    skipBtn.hidden = false;
    skipBtn.addEventListener('click', function () {
      window.location.href = 'results.html?round=1&skip=1';
    });
  }

  /* ---------- Round 2 skips the rules and goes straight to the countdown ---------- */
  if (round > 1) {
    startCountdown();
  } else {
    // A new game: forget any photos from the last one
    store.remove('lynkR1Photo');
    store.remove('lynkR2Photo');
  }
})();