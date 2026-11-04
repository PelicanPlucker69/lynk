/* ==========================================================
   LYNK | Phone interface behaviour
   Flow:  lock screen (haptic notification)
       -> camera with a countdown
       -> photo confirmation (submit / try again)
       -> "go back to your laptop"        (or "time's up")
   Not connected to the main site yet: it is a standalone prototype.
   ========================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- Settings you can tweak ---------- */
  var HUNT_SECONDS = 30;        // how long the player has to take and submit a photo
  var NOTIFY_DELAY_MS = 1500;   // pause on the lock screen before the notification buzzes
  var MAX_PHOTO_SIDE = 720;     // photos are shrunk to this size so they upload fast

  var OBJECTIVES = [
    { text: 'Find something BLUE',   color: '#2F6BFF' },
    { text: 'Find something RED',    color: '#E5484D' },
    { text: 'Find something GREEN',  color: '#2FA84F' },
    { text: 'Find something YELLOW', color: '#F5C518' },
    { text: 'Find something you can drink from', color: '#30E4B6' },
    { text: 'Find something with words on it',   color: '#28328C' }
  ];

  /* ---------- Link to the laptop pages (same browser for now, see link.js) ---------- */
  var linkedObjective = null;   // the objective the laptop picked
  var linkedRound = 1;

  /* ---------- Screens ---------- */
  var screens = {
    lock: $('screenLock'),
    camera: $('screenCamera'),
    review: $('screenReview'),
    done: $('screenDone'),
    timeup: $('screenTimeup')
  };
  var current = 'lock';

  function show(name) {
    current = name;
    $('device').setAttribute('data-screen', name);
    Object.keys(screens).forEach(function (key) { screens[key].hidden = key !== name; });
  }

  function announce(text) { $('live').textContent = text; }

  /* ---------- Clock on the lock screen + fake status bar ---------- */
  function updateClock() {
    var now = new Date();
    var h = now.getHours();
    var m = now.getMinutes();
    var hh12 = h % 12 || 12;
    var mm = (m < 10 ? '0' : '') + m;
    $('lockTime').textContent = hh12 + ':' + mm;
    $('statusTime').textContent = hh12 + ':' + mm;
    $('lockDate').textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  }
  updateClock();
  setInterval(updateClock, 15000);

  /* ---------- 1. Lock screen: the notification "buzzes" ---------- */
  var notif = $('notif');
  var notifTimer = null;

  function showNotification() {
    notif.hidden = false;
    try { if (navigator.vibrate) { navigator.vibrate([200, 100, 200]); } } catch (e) { /* ignore */ }
    announce('Notification from LYNK: Get ready for the game!');
  }

  function startLock() {
    show('lock');
    notif.hidden = true;
    clearTimeout(notifTimer);
    notifTimer = setTimeout(showNotification, NOTIFY_DELAY_MS);
  }

  notif.addEventListener('click', function () { startHunt(); });

  // Messages from the laptop: countdown started -> buzz; hunt started -> use its objective
  if (window.LynkLink) {
    window.LynkLink.on(function (msg) {
      if (!msg || !msg.type) { return; }
      if (msg.round) { linkedRound = msg.round; }

      if (msg.type === 'countdown') {
        if (current === 'done' || current === 'timeup') { restart(); }
        if (current === 'lock') { clearTimeout(notifTimer); showNotification(); }
      }

      if (msg.type === 'hunt' && msg.objective) {
        linkedObjective = { text: msg.objective.title, color: msg.objective.color };
        if (current === 'lock') { clearTimeout(notifTimer); showNotification(); }
        if (current === 'camera' || current === 'review') {
          $('objText').textContent = linkedObjective.text;
          $('objDot').style.background = linkedObjective.color;
        }
      }
    });
  }

  /* ---------- Countdown ---------- */
  var remaining = HUNT_SECONDS;
  var tickTimer = null;
  var startedAt = 0;
  var timerBoxes = [$('timerCam').parentNode, $('timerRev').parentNode];

  function fmt(seconds) {
    var s = Math.max(0, seconds);
    var m = Math.floor(s / 60);
    var r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }

  function renderTimer() {
    $('timerCam').textContent = fmt(remaining);
    $('timerRev').textContent = fmt(remaining);
    timerBoxes.forEach(function (box) {
      box.classList.toggle('is-low', remaining <= 10 && remaining > 5);
      box.classList.toggle('is-critical', remaining <= 5);
    });
  }

  function stopTimer() {
    clearInterval(tickTimer);
    tickTimer = null;
  }

  function startTimer() {
    stopTimer();
    remaining = HUNT_SECONDS;
    startedAt = Date.now();
    renderTimer();
    tickTimer = setInterval(function () {
      remaining = Math.max(0, HUNT_SECONDS - Math.floor((Date.now() - startedAt) / 1000));
      renderTimer();
      if (remaining === 10 || remaining === 5) { announce(remaining + ' seconds remaining'); }
      if (remaining <= 0) { timeUp(); }
    }, 250);
  }

  /* ---------- 2. Camera ---------- */
  var video = $('video');
  var vfMsg = $('vfMsg');
  var stream = null;
  var cameraWorks = false;

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
    }
    video.srcObject = null;
  }

  function startCamera() {
    cameraWorks = false;
    vfMsg.hidden = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      vfMsg.hidden = false;
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(function (s) {
        if (current !== 'camera') { s.getTracks().forEach(function (t) { t.stop(); }); return; }
        stream = s;
        video.srcObject = s;
        cameraWorks = true;
        vfMsg.hidden = true;
      })
      .catch(function () {
        vfMsg.hidden = false;   // no camera / permission blocked: demo photo fallback
      });
  }

  function startHunt() {
    var objective = linkedObjective || OBJECTIVES[Math.floor(Math.random() * OBJECTIVES.length)];
    $('objText').textContent = objective.text;
    $('objDot').style.background = objective.color;

    show('camera');
    startTimer();
    startCamera();
    announce('Hunt started. ' + objective.text + '. You have ' + HUNT_SECONDS + ' seconds.');
  }

  /* ---------- Taking the photo ---------- */
  var photoUrl = '';

  function demoPhoto() {
    var c = document.createElement('canvas');
    c.width = 450; c.height = 600;
    var ctx = c.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, 600);
    g.addColorStop(0, '#A1F9CF');
    g.addColorStop(1, '#1B735D');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 450, 600);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '700 44px Poppins, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Demo photo', 225, 300);
    ctx.font = '500 26px Poppins, system-ui, sans-serif';
    ctx.fillText($('objText').textContent, 225, 345);
    return c.toDataURL('image/jpeg', 0.72);
  }

  function takePhoto() {
    if (cameraWorks && video.videoWidth) {
      var scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(video.videoWidth, video.videoHeight));
      var c = document.createElement('canvas');
      c.width = Math.round(video.videoWidth * scale);
      c.height = Math.round(video.videoHeight * scale);
      c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
      photoUrl = c.toDataURL('image/jpeg', 0.72);
    } else {
      photoUrl = demoPhoto();
    }
    try { if (navigator.vibrate) { navigator.vibrate(40); } } catch (e) { /* ignore */ }

    stopCamera();
    $('photo').src = photoUrl;
    show('review');
    announce('Photo taken. Submit it or try again.');
  }

  $('shutter').addEventListener('click', takePhoto);

  /* ---------- 3. Confirmation ---------- */
  $('retryBtn').addEventListener('click', function () {
    show('camera');
    startCamera();
    announce('Try again. Take a new photo.');
  });

  $('submitBtn').addEventListener('click', function () {
    var took = Math.max(1, Math.min(HUNT_SECONDS, Math.round((Date.now() - startedAt) / 1000)));
    stopTimer();
    if (window.LynkLink) { window.LynkLink.send({ type: 'photo', round: linkedRound, photo: photoUrl, seconds: took }); }
    $('doneThumb').src = photoUrl;
    $('doneTime').textContent = 'Submitted in ' + Math.floor(took / 60) + ':' + (took % 60 < 10 ? '0' : '') + (took % 60);
    show('done');
    $('doneTitle').focus({ preventScroll: true });
    announce('Photo submitted. Go back to your laptop and press Finish.');
  });

  /* ---------- Time ran out ---------- */
  function timeUp() {
    stopTimer();
    stopCamera();
    show('timeup');
    $('timeupTitle').focus({ preventScroll: true });
    announce('Time is up. Go back to your laptop and press Finish.');
  }

  /* ---------- Restart the demo ---------- */
  function restart() {
    linkedObjective = null;
    stopTimer();
    stopCamera();
    startLock();
  }
  $('restartBtn').addEventListener('click', restart);
  $('restartBtn2').addEventListener('click', restart);

  window.addEventListener('pagehide', stopCamera);

  startLock();
})();