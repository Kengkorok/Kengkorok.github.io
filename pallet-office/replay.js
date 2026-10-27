// Replay a recording (NDJSON of {t, msg}) through the same office renderer.
//   replay.html                      pick from the server's recordings/
//   replay.html?src=demo.ndjson      any URL, works on a static host too
//   &autoplay=1&loop=1&speed=4       for an embedded demo
(function () {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const MAX_GAP = 2500; // squash long quiet stretches so demos keep moving

  const office = PalletOffice.createOffice($('office'), $('feed'));
  let frames = [];
  let i = 0;
  let clock = 0;
  let playing = false;
  let timer = null;

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
    restart();
  }

  function restart() {
    stop();
    office.clear();
    office.apply({ type: 'snapshot', sessions: [], feed: [] });
    i = 0;
    clock = 0;
    showPos();
  }

  function showPos() {
    $('pos').textContent = frames.length ? `${i}/${frames.length}` : 'tiada rakaman';
  }

  function step() {
    if (!playing) return;
    const speed = Number($('speed').value);
    while (i < frames.length && frames[i].t <= clock) office.apply(frames[i++].msg);
    showPos();
    if (i >= frames.length) {
      if (params.get('loop')) {
        timer = setTimeout(() => { restart(); play(); }, 4000);
      } else stop();
      return;
    }
    const wait = (frames[i].t - clock) / speed;
    clock = frames[i].t;
    timer = setTimeout(step, wait);
  }

  function play() {
    if (!frames.length) return;
    if (i >= frames.length) restart();
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
  $('restart').onclick = () => { restart(); play(); };
  if (params.get('speed')) $('speed').value = params.get('speed');

  async function init() {
    const src = params.get('src');
    if (src) {
      $('file').hidden = true;
      $('back').hidden = true;
      await load(src);
    } else {
      const res = await fetch('api/recordings').catch(() => null);
      const files = res && res.ok ? await res.json() : [];
      for (const f of files) $('file').append(new Option(f, f));
      $('file').onchange = () => load(`recordings/${encodeURIComponent($('file').value)}`);
      if (files.length) await load(`recordings/${encodeURIComponent(files[0])}`);
      else showPos();
    }
    if (params.get('autoplay')) play();
  }

  init();
})();
