// Soft looping background music for any page with a #music button (and optionally
// a #volume slider). Browsers hold audio until the first click or key press, so it
// starts then unless it was switched off last visit.
(function () {
  const $ = (id) => document.getElementById(id);
  if (!$('music')) return;
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
})();
