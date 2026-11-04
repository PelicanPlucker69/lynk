/* ==========================================================
   LYNK | Results page behaviour (self-contained)
   1. "Waiting for everyone else to finish..." for about 10 seconds
   2. Then the leaderboard appears
   The game has 2 rounds (results.html?round=1 and ?round=2):
   - after round 1 the leaderboard shows a loading symbol for 5
     seconds, then round 2 starts
   - after round 2 the leaderboard shows the COMBINED points of both
     rounds, with "Back to meeting" and "Play again"
   ========================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- Settings you can tweak ---------- */
  var WAIT_MS = 10000;          // how long the waiting screen lasts
  var NEXT_ROUND_MS = 5000;     // loading time before round 2 starts
  var TOTAL_ROUNDS = 2;

  var YOU = 'Bobby';            // you are the host in this prototype
  var POINTS_BY_PLACE = [150, 120, 90, 60];

  /* The other players' finishing times for each round, in seconds
     (made-up for the prototype, different every round) */
  var OTHERS_BY_ROUND = {
    1: [
      { name: 'Alex K.',   seconds: 52 },
      { name: 'Jordan T.', seconds: 67 },
      { name: 'Morgan P.', seconds: 84 }
    ],
    2: [
      { name: 'Alex K.',   seconds: 61 },
      { name: 'Jordan T.', seconds: 48 },
      { name: 'Morgan P.', seconds: 95 }
    ]
  };

  /* Used if someone opens this page directly (no stored time) */
  var DEFAULT_SECONDS = { 1: 92, 2: 75 };

  /* Which round just finished? results.html?round=1 or ?round=2 */
  var roundMatch = window.location.search.match(/[?&]round=(\d+)/);
  var round = roundMatch ? Math.min(TOTAL_ROUNDS, Math.max(1, Number(roundMatch[1]))) : 1;

  /* results.html?round=1&skip=1 = round 2 was skipped: show the podium using
     only the rounds that were finished */
  var skipped = /[?&]skip=1/.test(window.location.search);
  var isFinal = skipped || round >= TOTAL_ROUNDS;
  var roundsScored = skipped ? round : TOTAL_ROUNDS;

  /* ---------- Safe sessionStorage (shared between pages) ---------- */
  var store = {
    get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } },
    remove: function (k) { try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };

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
  $('chatBtn').addEventListener('click', function () { toast('Chat is on the meeting screen'); });
  $('moreBtn').addEventListener('click', function () { toast('More options are coming in a later version'); });
  $('peopleBtn').addEventListener('click', function () { toast('4 participants in this meeting'); });

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

  /* ---------- Helpers ---------- */
  function formatStopwatch(totalSeconds) {
    var m = Math.floor(totalSeconds / 60);
    var s = totalSeconds % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function ordinal(n) {
    var suffixes = { 1: 'st', 2: 'nd', 3: 'rd' };
    return n + (suffixes[n] || 'th');
  }

  /* Your times come from the game page ("Next" button), one per round. */
  function mySecondsFor(r) {
    return Number(store.get('lynkR' + r + 'Seconds')) || DEFAULT_SECONDS[r];
  }

  function objectiveFor(r) {
    return store.get('lynkR' + r + 'Objective') || 'Scavenger Hunt';
  }

  $('mySubmitTime').textContent = formatStopwatch(mySecondsFor(round));
  $('waitRound').textContent = 'Round ' + round + ' of ' + TOTAL_ROUNDS;

  /* ---------- 1. Waiting screen: photos + progress ---------- */
  var total = OTHERS_BY_ROUND[round].length + 1;
  var finishedEl = $('finishedCount');
  var progBar = $('progBar');
  var everyoneDone = false;

  function showFinished(count) {
    finishedEl.textContent = count + ' of ' + total + ' finished';
    progBar.style.width = Math.round((count / total) * 100) + '%';
  }

  /* Photo gallery: your real photo (sent from the phone page) comes first.
     The other players' photos are made-up placeholders for the prototype. */
  var photos = [];          // { name, src, seconds, you }
  var galIndex = 0;
  var userBrowsed = false;  // once you click an arrow we stop jumping to new photos

  var OBJECT_COLOURS = { BLUE: '#2F6BFF', RED: '#E5484D', GREEN: '#2FA84F', YELLOW: '#F5C518' };

  function placeholderPhoto(name) {
    var title = objectiveFor(round).toUpperCase();
    var colour = '#30E4B6';
    Object.keys(OBJECT_COLOURS).forEach(function (word) {
      if (title.indexOf(word) !== -1) { colour = OBJECT_COLOURS[word]; }
    });

    var c = document.createElement('canvas');
    c.width = 480; c.height = 360;
    var ctx = c.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 480, 360);
    g.addColorStop(0, '#EAF7F1');
    g.addColorStop(1, '#BFD9CE');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 480, 360);
    ctx.fillStyle = 'rgba(14,42,35,0.12)';          // a "table"
    ctx.fillRect(0, 250, 480, 110);
    ctx.fillStyle = colour;                          // the "object"
    ctx.beginPath();
    ctx.arc(240, 190, 78, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(14,42,35,0.55)';
    ctx.font = '600 22px Poppins, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Demo photo from ' + name, 240, 330);
    return c.toDataURL('image/jpeg', 0.8);
  }

  function renderGallery(isNew) {
    var img = $('galImg');
    var empty = $('galEmpty');
    var dots = $('galDots');
    var many = photos.length > 1;
    $('galPrev').disabled = !many;
    $('galNext').disabled = !many;
    $('galPrev').hidden = $('galNext').hidden = !photos.length;

    dots.textContent = '';
    if (!photos.length) {
      img.hidden = true;
      empty.hidden = false;
      $('galCap').textContent = '';
      $('galNew').hidden = true;
      return;
    }

    var p = photos[galIndex];
    img.src = p.src;
    img.alt = 'Photo from ' + (p.you ? 'you' : p.name);
    img.hidden = false;
    empty.hidden = true;
    $('galNew').hidden = !isNew;
    $('galCap').textContent = (p.you ? p.name + ' (You)' : p.name) + ' · ' + formatStopwatch(p.seconds) +
      '  —  ' + (galIndex + 1) + ' of ' + photos.length;

    photos.forEach(function (_, i) {
      var dot = document.createElement('span');
      dot.className = 'r-gal-dot' + (i === galIndex ? ' is-active' : '');
      dots.appendChild(dot);
    });
  }

  function step(delta) {
    if (!photos.length) { return; }
    galIndex = (galIndex + delta + photos.length) % photos.length;
    userBrowsed = true;
    renderGallery(false);
  }

  $('galPrev').addEventListener('click', function () { step(-1); });
  $('galNext').addEventListener('click', function () { step(1); });
  $('gallery').addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { step(-1); }
    if (e.key === 'ArrowRight') { step(1); }
  });

  function addPhoto(photo) {
    photos.push(photo);
    if (!userBrowsed) { galIndex = photos.length - 1; }   // follow the newest photo until you start browsing
    renderGallery(photos.length > 1 && !userBrowsed);
  }

  var myPhoto = store.get('lynkR' + round + 'Photo');
  if (myPhoto) { addPhoto({ name: YOU, src: myPhoto, seconds: mySecondsFor(round), you: true }); }
  else { renderGallery(false); }

  showFinished(1); // you have already finished

  // The other players "finish" one by one while we wait: their photos arrive too
  OTHERS_BY_ROUND[round].forEach(function (other, index) {
    setTimeout(function () {
      showFinished(index + 2);
      addPhoto({ name: other.name, src: placeholderPhoto(other.name), seconds: other.seconds });
    }, Math.round(WAIT_MS * [0.3, 0.6, 0.9][index]));
  });

  // When everyone is done the Continue button appears; the page waits for YOU
  setTimeout(function () {
    everyoneDone = true;
    var btn = $('waitContinue');
    btn.hidden = false;
    finishedEl.textContent = 'Everyone has finished. Take your time looking at the photos.';
  }, WAIT_MS);

  /* ---------- Scoring ---------- */
  // Everyone's result for ONE round, fastest first, with points for their place
  function playersForRound(r) {
    var list = OTHERS_BY_ROUND[r].map(function (p) {
      return { name: p.name, seconds: p.seconds };
    });
    list.push({ name: YOU, seconds: mySecondsFor(r), you: true });
    list.sort(function (a, b) { return a.seconds - b.seconds; });
    list.forEach(function (p, i) { p.points = POINTS_BY_PLACE[i] || 10; });
    return list;
  }

  // Everyone's points added up over rounds 1..upTo (most points first,
  // ties go to whoever was quicker overall)
  function totalsUpTo(upTo) {
    var byName = {};
    for (var r = 1; r <= upTo; r += 1) {
      playersForRound(r).forEach(function (p) {
        var t = byName[p.name] || (byName[p.name] = {
          name: p.name, you: !!p.you, seconds: 0, points: 0, perRound: []
        });
        t.points += p.points;
        t.seconds += p.seconds;
        t.perRound.push(p.points);
      });
    }
    return Object.keys(byName).map(function (k) { return byName[k]; })
      .sort(function (a, b) { return (b.points - a.points) || (a.seconds - b.seconds); });
  }

  /* ---------- 2. Leaderboard ---------- */
  function addRow(list, index, row) {
    var place = index + 1;

    var li = document.createElement('li');
    li.className = 'r-row' + (place === 1 ? ' is-first' : '') + (row.you ? ' is-you' : '');
    li.style.setProperty('--i', String(index));

    var rank = document.createElement('span');
    rank.className = 'r-rank';
    rank.textContent = String(place);

    var name = document.createElement('span');
    name.className = 'r-name';
    name.appendChild(document.createTextNode(row.name));
    if (row.you) {
      var tag = document.createElement('span');
      tag.className = 'r-you-tag';
      tag.textContent = 'You';
      name.appendChild(tag);
    }

    var detail = document.createElement('span');
    detail.className = 'r-time';
    detail.textContent = row.detail;

    var pts = document.createElement('span');
    pts.className = 'r-pts';
    pts.textContent = '+' + row.points;

    li.appendChild(rank);
    li.appendChild(name);
    li.appendChild(detail);
    li.appendChild(pts);
    list.appendChild(li);
  }

  /* Fill the podium: pods are in the page as 2nd, 1st, 3rd (left to right) */
  var INITIALS = { 'Bobby': 'BO', 'Jordan T.': 'JT', 'Morgan P.': 'MP', 'Alex K.': 'AK' };

  function showPodium(ranked) {
    [1, 2, 3].forEach(function (place) {
      var pod = document.querySelector('.r-pod-' + place);
      var t = ranked[place - 1];
      pod.querySelector('.r-pod-avatar').textContent = INITIALS[t.name] || '';
      var nameEl = pod.querySelector('.r-pod-name');
      nameEl.textContent = t.name;
      if (t.you) {
        var tag = document.createElement('span');
        tag.className = 'r-you-tag';
        tag.textContent = 'You';
        nameEl.appendChild(tag);
      }
      pod.querySelector('.r-pod-pts').textContent = t.points + ' pts';
    });
    $('podium').hidden = false;
  }

  function buildLeaderboard() {
    var list = $('boardList');
    list.textContent = '';

    if (isFinal) {
      // Final results: points from every round added together,
      // shown as a podium for the top 3 (like Kahoot)
      var ranked = totalsUpTo(roundsScored);
      ranked.forEach(function (t, index) {
        if (t.you) {
          $('finalPos').textContent = 'Your final position: ' + ordinal(index + 1);
          $('finalPtsNum').textContent = t.points + ' pts';
        }
      });
      $('boardSummary').hidden = true;
      $('finalPos').hidden = false;
      $('finalPts').hidden = false;
      showPodium(ranked);

            // Switch to the reward colour scheme (gold, cream, peach, navy)
      document.querySelector('.r-card').classList.add('is-reward');
      $('boardTitle').textContent = 'Leaderboard';
      $('boardObjective').textContent = skipped ? 'Scavenger Hunt complete \u00B7 after round ' + roundsScored : 'Scavenger Hunt complete';
    } else {
      // Round board: just this round
      playersForRound(round).forEach(function (p, index) {
        addRow(list, index, {
          name: p.name,
          you: p.you,
          detail: formatStopwatch(p.seconds),
          points: p.points
        });

        if (p.you) {
          $('boardSummary').textContent =
            'You placed ' + ordinal(index + 1) + ' in round ' + round + ' and earned +' + p.points + ' points!';
        }
      });

      $('boardObjective').textContent =
        'Round ' + round + ' of ' + TOTAL_ROUNDS + ' \u00B7 ' + objectiveFor(round);
      $('boardTitle').textContent = 'Round ' + round + ' results';
    }
  }

  /* Confetti and stars for the end of the game (skipped for people who
     have asked their device for reduced motion) */
  function launchCelebration() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { return; }

    var layer = document.createElement('div');
    layer.className = 'r-confetti';
    layer.setAttribute('aria-hidden', 'true');

    var colours = ['gold', 'navy', 'peach', 'cream', 'gold', 'navy'];
    for (var i = 0; i < 90; i += 1) {
      var shape = i % 4 === 0 ? 'star' : (i % 5 === 0 ? 'dot' : 'rect');
      var colour = shape === 'star' ? (i % 8 === 0 ? 'navy' : 'gold') : colours[i % colours.length];

      var bit = document.createElement('span');
      bit.className = 'r-conf r-conf-' + shape + ' r-conf-' + colour;
      bit.style.left = (Math.random() * 100).toFixed(1) + '%';
      bit.style.setProperty('--s', (7 + Math.random() * 7).toFixed(1) + 'px');
      bit.style.setProperty('--dx', Math.round((Math.random() - 0.5) * 220) + 'px');
      bit.style.setProperty('--rot', Math.round((Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 720)) + 'deg');
      bit.style.animationDuration = (3.2 + Math.random() * 2.3).toFixed(2) + 's';
      bit.style.animationDelay = (Math.random() * 1.6).toFixed(2) + 's';
      layer.appendChild(bit);
    }

    document.body.appendChild(layer);
    setTimeout(function () {
      if (layer.parentNode) { layer.parentNode.removeChild(layer); }
    }, 8000);
  }

  /* After round 1: loading symbol + short countdown, then round 2 begins */
  function startNextRoundLoader() {
    var box = $('nextRound');
    var countEl = $('nextCount');
    var left = Math.round(NEXT_ROUND_MS / 1000);

    box.hidden = false;
    countEl.textContent = String(left);

    var timer = setInterval(function () {
      left -= 1;
      if (left <= 0) {
        clearInterval(timer);
        window.location.href = 'game.html?round=' + (round + 1);
        return;
      }
      countEl.textContent = String(left);
    }, 1000);
  }

  function showResults() {
    buildLeaderboard();
    $('viewWaiting').hidden = true;
    $('viewBoard').hidden = false;
    $('statusPill').textContent = isFinal ? 'Status: Hunt complete' : 'Status: Round ' + round + ' complete';

    var heading = $('viewBoard').querySelector('[tabindex="-1"]');
    if (heading) { heading.focus({ preventScroll: true }); }

    if (isFinal) {
      // Only now do the "Back to meeting" / "Play again" options appear
      $('finalActions').hidden = false;
      $('skipBtn').hidden = true;
      launchCelebration();
    } else {
      // Round 1 is done: you can now skip round 2 if you like
      $('skipBtn').hidden = false;
      startNextRoundLoader();
    }
  }

  $('waitContinue').addEventListener('click', showResults);

  $('skipBtn').addEventListener('click', function () {
    window.location.href = 'results.html?round=1&skip=1';
  });

  // Skipping round 2 jumps straight to the podium, no waiting screen
  if (skipped) { showResults(); }
  // In round 2 the skip button is available while looking at the photos
  else if (round >= 2) { $('skipBtn').hidden = false; }
})();