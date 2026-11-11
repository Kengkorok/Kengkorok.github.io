// Suis tema cerah/gelap. Tema awal dah diset dalam <head> (localStorage atau tetapan peranti)
{
  const root = document.documentElement;
  const suis = document.querySelector('.tema');
  const simpan = (t) => { try { localStorage.setItem('tema', t); } catch {} };
  const pasang = (t) => {
    root.dataset.theme = t;
    suis?.setAttribute('aria-checked', String(t === 'dark'));
  };
  pasang(root.dataset.theme === 'dark' ? 'dark' : 'light');

  suis?.addEventListener('click', () => {
    const baru = root.dataset.theme === 'dark' ? 'light' : 'dark';
    simpan(baru);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return pasang(baru);
    if (!document.startViewTransition) {
      // Pelayar tanpa View Transitions: pudarkan warna sahaja
      root.classList.add('tema-pudar');
      pasang(baru);
      setTimeout(() => root.classList.remove('tema-pudar'), 400);
      return;
    }
    // Tema baru terbuka sebagai bulatan dari suis
    const b = suis.getBoundingClientRect();
    const x = b.left + b.width / 2, y = b.top + b.height / 2;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.classList.add('tema-vt');
    const vt = document.startViewTransition(() => pasang(baru));
    vt.ready.then(() => root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 550, easing: 'cubic-bezier(.2, .7, .2, 1)', pseudoElement: '::view-transition-new(root)' },
    )).catch(() => {});
    vt.finished.finally(() => root.classList.remove('tema-vt'));
  });

  // Ikut tetapan peranti selagi pembaca belum pilih sendiri
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    let pilih = null;
    try { pilih = localStorage.getItem('tema'); } catch {}
    if (!pilih) pasang(e.matches ? 'dark' : 'light');
  });
}

// Waktu Kuala Lumpur di footer
const klTime = document.getElementById('kl-time');
const fmt = new Intl.DateTimeFormat('ms-MY', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', hour12: false });
const tick = () => { if (klTime) klTime.textContent = fmt.format(new Date()); };
tick();
setInterval(tick, 30_000);

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const behavior = reduceMotion ? 'auto' : 'smooth';

// Tambah kelas `is-in` sekali sahaja bila elemen masuk skrin
const onceVisible = (el, fn, threshold = 0.15) => new IntersectionObserver(([e], io) => {
  if (!e.isIntersecting) return;
  io.disconnect();
  fn(el);
}, { threshold }).observe(el);

document.querySelectorAll('.reveal').forEach((el) => onceVisible(el, () => el.classList.add('is-in')));

// Lab: butang sebelum/seterusnya, kaunter, dan seret dengan tetikus
const lab = document.querySelector('.lab');
const track = document.querySelector('.lab__track');
if (lab && track) {
  onceVisible(lab, () => lab.classList.add('is-in'), 0.05);

  const slides = [...track.children];
  const count = lab.querySelector('.lab__count');
  const [prevBtn, nextBtn] = lab.querySelectorAll('.lab__btn');
  const pad = (n) => String(n).padStart(2, '0');
  const step = () => slides[0].getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 0);
  const current = () => Math.min(slides.length - 1, Math.round(track.scrollLeft / step()));

  const sync = () => {
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
    const i = atEnd ? slides.length - 1 : current();
    if (count) count.textContent = `${pad(i + 1)} / ${pad(slides.length)}`;
    if (prevBtn) prevBtn.disabled = track.scrollLeft <= 2;
    if (nextBtn) nextBtn.disabled = atEnd;
  };
  [prevBtn, nextBtn].forEach((btn) => btn?.addEventListener('click', () => {
    track.scrollTo({ left: (current() + Number(btn.dataset.dir)) * step(), behavior });
  }));
  track.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    track.scrollTo({ left: (current() + (e.key === 'ArrowRight' ? 1 : -1)) * step(), behavior });
  });
  track.addEventListener('scroll', sync, { passive: true });
  addEventListener('resize', sync);
  sync();

  // Sentuh dan trackpad dah boleh skrol sendiri; tetikus perlu diseret
  let startX = 0, startLeft = 0, moved = false;
  track.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    startX = e.clientX; startLeft = track.scrollLeft; moved = false;
    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      if (!moved && Math.abs(dx) > 4) { moved = true; track.classList.add('is-dragging'); }
      if (moved) track.scrollLeft = startLeft - dx;
    };
    const onUp = () => {
      removeEventListener('pointermove', onMove);
      if (!moved) return;
      track.classList.remove('is-dragging');
      track.scrollTo({ left: current() * step(), behavior });
    };
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp, { once: true });
  });
  // Klik yang menamatkan seretan tak patut membuka projek
  track.addEventListener('click', (e) => { if (moved) { e.preventDefault(); moved = false; } }, true);
}

// Video Lab dimuat hanya bila kad kelihatan, dan berhenti bila keluar skrin (telefon dapat versi 640px)
const small = matchMedia('(max-width: 700px)');
const lazyVideos = new IntersectionObserver((entries) => entries.forEach(({ target: v, isIntersecting }) => {
  if (!isIntersecting) { v.pause(); return; }
  if (!v.getAttribute('src')) v.src = (small.matches && v.dataset.srcPhone) || v.dataset.src;
  if (!reduceMotion) v.play().catch(() => {});
}), { threshold: 0.1 });
document.querySelectorAll('video[data-src]').forEach((v) => lazyVideos.observe(v));

// Telefon terapung: setiap satu ada tempo dan titik mula sendiri supaya tak bergerak serentak
document.querySelectorAll('.phone').forEach((p) => {
  const dur = 4.5 + Math.random() * 3.5;
  p.style.setProperty('--dur', `${dur.toFixed(2)}s`);
  p.style.setProperty('--delay', `${(-Math.random() * dur * 2).toFixed(2)}s`);
  p.style.setProperty('--float', `${(10 + Math.random() * 6).toFixed(1)}px`);
});
// ...dan masuk satu-satu selepas gambar dimuat dan kad kelihatan
document.querySelectorAll('.lab__frame--phones').forEach((frame) => {
  const loaded = Promise.all([...frame.querySelectorAll('img')].map((img) => (img.complete ? null : img.decode().catch(() => {}))));
  onceVisible(frame, () => loaded.then(() => frame.classList.add('is-in')));
});

// Terminal CI/CD: main semula setiap kali kad masuk skrin
document.querySelectorAll('.term').forEach((term) => new IntersectionObserver(([e]) => {
  term.classList.toggle('is-on', e.isIntersecting);
}, { threshold: 0.4 }).observe(term));

// Kad bertindan: bila kad seterusnya menutup, kad bawah mengecil dan malap sedikit
const cards = [...document.querySelectorAll('.card')];
if (!reduceMotion && cards.length > 1) {
  let ticking = false;
  const update = () => {
    ticking = false;
    cards.forEach((card, i) => {
      const next = cards[i + 1];
      if (!next) return;
      const top = parseFloat(getComputedStyle(card).top) || 0;
      const start = top + card.offsetHeight;
      const end = parseFloat(getComputedStyle(next).top) || 0;
      const p = Math.min(1, Math.max(0, (start - next.getBoundingClientRect().top) / (start - end)));
      card.style.transform = `scale(${1 - 0.06 * p})`;
      card.style.filter = `brightness(${1 - 0.22 * p})`;
    });
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  update();
}

// Kursor ikon korokk berpusing di seluruh bahagian Kerjaya (tetikus sahaja)
const cursor = document.querySelector('.cursor');
const career = document.querySelector('.career');
if (cursor && career && matchMedia('(pointer: fine)').matches && !reduceMotion) {
  const ikut = (e) => {
    cursor.style.left = `${e.clientX}px`;
    cursor.style.top = `${e.clientY}px`;
  };
  addEventListener('pointermove', ikut, { passive: true });
  career.classList.add('ada-kursor');
  career.addEventListener('pointerenter', (e) => { ikut(e); cursor.classList.add('is-on'); });
  career.addEventListener('pointerleave', () => cursor.classList.remove('is-on'));
}

// Statistik: hantar satu rekod setiap halaman dibuka ke Worker komen.
// Pemilik tak dikira: Studio set cookie korok_abai pada .korokk.com, atau buka ?abai=1 sekali (?abai=0 untuk batal).
{
  const HIT = 'https://komen.sa7one.workers.dev/hit';
  const q = new URLSearchParams(location.search);
  if (q.has('abai')) {
    const on = q.get('abai') !== '0';
    document.cookie = `korok_abai=1; domain=korokk.com; path=/; secure; samesite=lax; max-age=${on ? 315360000 : 0}`;
    q.delete('abai');
    history.replaceState(null, '', location.pathname + (q.size ? `?${q}` : '') + location.hash);
    alert(on ? 'Lawatan dari browser ni tak dikira lagi.' : 'Lawatan dari browser ni dikira semula.');
  }
  const owner = /(?:^|;\s*)korok_abai=1/.test(document.cookie);
  if (!owner && /(^|\.)korokk\.com$/.test(location.hostname) && navigator.sendBeacon) {
    let v;
    try {
      v = localStorage.getItem('korok-pelawat');
      if (!v) localStorage.setItem('korok-pelawat', (v = crypto.randomUUID()));
    } catch { v = crypto.randomUUID(); }
    navigator.sendBeacon(HIT, new Blob([JSON.stringify({ p: location.pathname, v })], { type: 'text/plain' }));
  }
}
