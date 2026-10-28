// Replay a recording (NDJSON of {t, msg}) through the same office renderer, looping
// by default so the island never empties.
//   replay.html                       pick from the server's recordings/
//   replay.html?src=demo.ndjson       any URL, works on a static host too
//   &autoplay=0  &loop=0  &speed=2    to change the defaults
(function () {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const MAX_GAP = 4000; // squash long quiet stretches so demos keep moving
  const LOOP = params.get('loop') !== '0';

  // Recording wall-clock time: the latest timestamp seen plus playback time since then.
  let wall = 0;
  let wallAt = 0;
  const wallClock = () => (wall ? wall + (performance.now() - wallAt) * Number($('speed').value) : Date.now());
  const office = PalletOffice.createOffice($('office'), {
    feed: $('feed'),
    team: { list: $('team'), summary: $('team-summary') },
    clock: wallClock,
  });
  function seen(msg) {
    const times = [msg.item && msg.item.t, msg.session && msg.session.changedAt, ...(msg.feed || []).map((f) => f.t)].filter(Boolean);
    if (times.length) {
      wall = Math.max(wall, ...times);
      wallAt = performance.now();
    }
  }
  let frames = [];
  let i = 0;
  let clock = 0;
  let playing = false;
  let timer = null;
  let started = false;

  async function load(src) {
    stop();
    const text = await (await fetch(src)).text();
    const raw = text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
    let prev = 0;
    let t = 0;
    frames = raw.map((f) => {
      t += Math.min(f.t - prev, MAX_GAP);
      prev = f.t;
      return { t, msg: f.msg };
    });
    started = false;
    rewind();
  }

  function rewind() {
    wall = 0;
    i = 0;
    clock = 0;
    showPos();
  }

  function showPos() {
    $('pos').textContent = frames.length ? `${i}/${frames.length}` : 'tiada rakaman';
  }

  // On a loop, the opening snapshot becomes ordinary updates so everyone walks back
  // to their place instead of teleporting.
  function play1(msg) {
    seen(msg);
    if (msg.type === 'snapshot' && started) {
      msg.sessions.forEach((session) => office.apply({ type: 'session', session }));
      return;
    }
    started = true;
    office.apply(msg);
  }

  function step() {
    if (!playing) return;
    const speed = Number($('speed').value);
    while (i < frames.length && frames[i].t <= clock) play1(frames[i++].msg);
    showPos();
    if (i >= frames.length) {
      if (LOOP) timer = setTimeout(() => { rewind(); step(); }, 6000 / speed);
      else stop();
      return;
    }
    const wait = (frames[i].t - clock) / speed;
    clock = frames[i].t;
    timer = setTimeout(step, wait);
  }

  function play() {
    if (!frames.length) return;
    if (i >= frames.length) rewind();
    playing = true;
    $('play').textContent = '⏸ Pause';
    step();
  }

  function stop() {
    playing = false;
    clearTimeout(timer);
    $('play').textContent = '▶ Main';
  }

  $('play').onclick = () => (playing ? stop() : play());
  $('restart').onclick = () => {
    stop();
    office.clear();
    started = false;
    rewind();
    play();
  };
  // Background music, soft and looping. Browsers hold audio until the first click
  // or key press, so it starts then unless it was switched off last visit.
  const music = new Audio('music/warm-arpeggios.mp3');
  music.loop = true;
  music.volume = 0.15;
  let musicOn = true;
  try { musicOn = localStorage.getItem('pallet-music') !== 'off'; } catch {}
  const volume = $('volume');
  if (volume) {
    try { volume.value = localStorage.getItem('pallet-volume') ?? volume.value; } catch {}
    const setVolume = () => {
      music.volume = Number(volume.value);
      try { localStorage.setItem('pallet-volume', volume.value); } catch {}
    };
    volume.oninput = setVolume;
    setVolume();
  }
  function setMusic(on) {
    musicOn = on;
    $('music').classList.toggle('on', on);
    $('music').setAttribute('aria-pressed', on);
    try { localStorage.setItem('pallet-music', on ? 'on' : 'off'); } catch {}
    if (on) music.play().catch(() => {});
    else music.pause();
  }
  $('music').onclick = () => setMusic(music.paused); // paused also covers "blocked so far"
  const unlock = (e) => {
    removeEventListener('pointerdown', unlock);
    removeEventListener('keydown', unlock);
    if (musicOn && e.target !== $('music')) setMusic(true); // the button's own click decides
  };
  addEventListener('pointerdown', unlock);
  addEventListener('keydown', unlock);
  if (musicOn) setMusic(true);

  $('full').onclick =() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
  if (params.get('speed')) $('speed').value = params.get('speed');

  async function init() {
    const src = params.get('src');
    if (src) {
      $('file').hidden = true;
      if ($('back')) $('back').hidden = true;
      await load(src);
    } else {
      const res = await fetch('api/recordings').catch(() => null);
      const files = res && res.ok ? await res.json() : [];
      for (const f of files) $('file').append(new Option(f, f));
      $('file').onchange = () => { office.clear(); load(`recordings/${encodeURIComponent($('file').value)}`).then(play); };
      const first = files.includes('demo.ndjson') ? 'demo.ndjson' : files[0];
      if (first) {
        $('file').value = first;
        await load(`recordings/${encodeURIComponent(first)}`);
      } else showPos();
    }
    if (params.get('autoplay') !== '0') play();
  }

  init();
})();
