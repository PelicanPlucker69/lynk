/* ==========================================================
   LYNK | Your camera on the video tiles (meeting, game, results)
   - Shows your live camera inside your own tile (Bobby, the host).
   - If the camera is off, blocked or missing, your initials show instead.
   - The Camera button on each page calls LynkCamera.setCam(true/false).
   Works in Chrome, Edge, Safari and Firefox over https or localhost.
   ========================================================== */
(function () {
  'use strict';

  var tile = document.getElementById('selfTile');
  if (!tile) { return; }
  var video = tile.querySelector('.cam-video');
  if (!video) { return; }

  var stream = null;
  var wanted = false;
  var attempt = 0;

  function stop() {
    attempt += 1;
    if (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
    }
    video.srcObject = null;
    tile.classList.remove('has-video');
  }

  function start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { return; }
    var mine = ++attempt;
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    }).then(function (s) {
      // The button may have been pressed again while the browser was asking
      if (!wanted || mine !== attempt) {
        s.getTracks().forEach(function (t) { t.stop(); });
        return;
      }
      stream = s;
      video.srcObject = s;
      var played = video.play();
      if (played && played.catch) { played.catch(function () { /* ignore */ }); }
      tile.classList.add('has-video');
    }).catch(function () {
      tile.classList.remove('has-video');   // blocked or no camera: keep the initials
    });
  }

  function setCam(on) {
    wanted = on;
    stop();
    if (on) { start(); }
  }

  window.LynkCamera = { setCam: setCam };
  window.addEventListener('pagehide', stop);

  // Match the Camera button state saved from the other pages
  var off = null;
  try { off = sessionStorage.getItem('lynkCamOff'); } catch (e) { off = null; }
  setCam(off !== '1');
})();