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

// /blog/: tapis ikut tag dan cari dalam semua tulisan
const list = document.querySelector('.blog .post-list');
if (list) {
  const rows = [...list.querySelectorAll('.post-row')];
  const tagBtns = [...document.querySelectorAll('.blog__tags button[data-tag]')];
  const lagi = document.querySelector('.blog__lagi');
  const search = document.querySelector('.blog__search input');
  const empty = document.querySelector('.blog__empty');
  let tag = new URLSearchParams(location.search).get('tag') || '';
  let terms = [];
  let index = null; // url -> teks penuh, dimuat bila mula menaip

  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let nampak = null; // baris yang kelihatan selepas render terakhir
  const render = () => {
    const kini = rows.filter((row) => {
      const okTag = !tag || row.dataset.tags.split(' ').includes(tag);
      const hay = index?.get(row.dataset.url) ?? norm(row.textContent);
      return okTag && terms.every((t) => hay.includes(t));
    });
    const tanda = kini.map((r) => r.dataset.url).join('|');
    if (nampak !== null && tanda !== nampak) {
      // set baris berubah: matikan animasi masuk dan pudarkan senarai sekejap
      list.classList.add('is-sedia');
      list.classList.remove('is-tukar');
      void list.offsetWidth;
      list.classList.add('is-tukar');
    }
    nampak = tanda;
    rows.forEach((row) => { row.hidden = !kini.includes(row); });
    list.classList.toggle('is-tapis', !!tag || terms.length > 0);
    empty.hidden = kini.length > 0;
    tagBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tag === tag)));
  };

  tagBtns.forEach((b) => b.addEventListener('click', () => {
    tag = b.dataset.tag;
    const url = new URL(location.href);
    if (tag) url.searchParams.set('tag', tag); else url.searchParams.delete('tag');
    history.replaceState(null, '', url);
    render();
  }));

  const loadIndex = () => {
    if (index) return;
    index = new Map();
    fetch(search.dataset.index)
      .then((r) => r.json())
      .then((posts) => {
        posts.forEach((p) => index.set(p.url, norm(`${p.title} ${p.tags.join(' ')} ${p.text}`)));
        render();
      })
      .catch(() => { index = null; });
  };
  let timer;
  search.addEventListener('focus', loadIndex, { once: true });
  search.addEventListener('input', () => {
    loadIndex();
    clearTimeout(timer);
    timer = setTimeout(() => { terms = norm(search.value).split(/\s+/).filter(Boolean); render(); }, 120);
  });

  // Tag yang jarang dipakai disorok di bawah butang "lagi"
  const bukaLagi = () => {
    tagBtns.forEach((b) => { b.hidden = false; });
    lagi?.remove();
  };
  lagi?.addEventListener('click', () => {
    const pertama = tagBtns.find((b) => b.hidden);
    bukaLagi();
    pertama?.focus();
  });

  // Tajuk dan cover baris yang diklik bergerak ke halaman post (view transition).
  // Nama kekal pada baris itu, jadi bila tekan "back" ia bergerak balik ke tempat asal.
  const namakan = (row) => {
    rows.forEach((r) => {
      r.querySelector('.post-row__title').style.viewTransitionName = r === row ? 'post-tajuk' : '';
      const img = r.querySelector('.post-row__thumb');
      if (img) img.style.viewTransitionName = r === row ? 'post-cover' : '';
    });
  };
  list.addEventListener('click', (e) => {
    const row = e.target.closest('.post-row');
    if (row) namakan(row);
  });
  // Datang dari halaman post melalui pautan (bukan "back"): namakan baris post itu
  try {
    const dari = window.navigation?.activation?.from?.url;
    const laluan = dari && new URL(dari).pathname;
    const row = laluan && rows.find((r) => r.dataset.url === laluan);
    if (row) { list.classList.add('is-sedia'); namakan(row); }
  } catch {}

  const btnTag = tagBtns.find((b) => b.dataset.tag === tag);
  if (!btnTag) tag = '';
  else if (btnTag.hidden) bukaLagi();
  render();
}

// Halaman post: beri id pada subtajuk dan bina senarai kandungan di lajur kiri
const prose = document.querySelector('.post .prose');
if (prose) {
  const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const heads = [...prose.querySelectorAll('h2')];
  heads.forEach((h) => {
    if (h.id) return;
    const base = slug(h.textContent) || 'bahagian';
    let id = base;
    for (let n = 2; document.getElementById(id); n++) id = `${base}-${n}`;
    h.id = id;
  });
  // Pautan terus ke subtajuk: id baru wujud sekarang, jadi lompat sendiri
  const sasaran = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (sasaran && heads.includes(sasaran)) sasaran.scrollIntoView();

  if (heads.length >= 3) {
    const toc = document.createElement('nav');
    toc.className = 'post__toc';
    toc.setAttribute('aria-label', 'Kandungan');
    const label = document.createElement('p');
    label.className = 'mono muted';
    label.textContent = 'Kandungan';
    const ol = document.createElement('ol');
    const links = heads.map((h) => {
      const a = document.createElement('a');
      a.href = `#${h.id}`;
      a.textContent = h.textContent.trim();
      const li = document.createElement('li');
      li.append(a);
      ol.append(li);
      return a;
    });
    toc.append(label, ol);
    prose.before(toc);

    // Tanda bahagian yang sedang dibaca: subtajuk terakhir yang dah lepas bahagian atas skrin
    let menunggu = false;
    const tanda = () => {
      menunggu = false;
      let i = -1;
      heads.forEach((h, n) => { if (h.getBoundingClientRect().top < 140) i = n; });
      links.forEach((a, n) => { if (n === i) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    };
    addEventListener('scroll', () => { if (!menunggu) { menunggu = true; requestAnimationFrame(tanda); } }, { passive: true });
    tanda();
  }
}

// Gambar dalam isi: klik untuk besarkan, hanya kalau skrin memang boleh tunjuk lebih besar dari dalam isi
if (prose && typeof HTMLDialogElement === 'function') {
  const gambar = [...prose.querySelectorAll('img')].filter((g) => !g.closest('a'));
  if (gambar.length) {
    const dlg = document.createElement('dialog');
    dlg.className = 'zum';
    dlg.setAttribute('aria-label', 'Gambar dibesarkan');
    const tutup = document.createElement('button');
    tutup.type = 'button';
    tutup.className = 'zum__tutup mono';
    tutup.textContent = 'Tutup ✕';
    const besar = new Image();
    dlg.append(tutup, besar);
    document.body.append(dlg);
    dlg.addEventListener('click', () => dlg.close());

    const lebihBesar = (g) => {
      if (!g.naturalWidth) return false;
      const muat = Math.min(g.naturalWidth, innerWidth - 32, ((innerHeight - 32) * g.naturalWidth) / g.naturalHeight);
      return muat > g.clientWidth * 1.15;
    };
    const buka = (g) => {
      if (!lebihBesar(g)) return;
      besar.src = g.currentSrc || g.src;
      besar.alt = g.alt;
      dlg.showModal();
    };
    gambar.forEach((g) => {
      const sedia = () => {
        if (!lebihBesar(g)) return;
        g.classList.add('boleh-zum');
        g.tabIndex = 0;
        g.setAttribute('role', 'button');
        g.setAttribute('aria-label', `Besarkan gambar${g.alt ? `: ${g.alt}` : ''}`);
      };
      if (g.complete) sedia(); else g.addEventListener('load', sedia, { once: true });
      g.addEventListener('click', () => buka(g));
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); buka(g); }
      });
    });
  }
}

// Kongsi: salin pautan post
const salin = document.querySelector('.post__salin');
if (salin) {
  const asal = salin.textContent;
  salin.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(salin.dataset.url);
      salin.textContent = 'Dah salin ✓';
      salin.classList.add('is-ok');
      setTimeout(() => { salin.textContent = asal; salin.classList.remove('is-ok'); }, 2000);
    } catch {
      window.prompt('Salin pautan ni:', salin.dataset.url);
    }
  });
}

// Komen: dua tab ("Nama sahaja" melalui Worker, "Guna GitHub" melalui giscus)
const komen = document.getElementById('komen');
if (komen) {
  const ghPanel = komen.querySelector('#panel-github');
  let giscusLoaded = false;
  const loadGiscus = () => {
    if (giscusLoaded) return;
    giscusLoaded = true;
    const d = ghPanel.dataset;
    const s = document.createElement('script');
    s.src = 'https://giscus.app/client.js';
    s.async = true;
    s.crossOrigin = 'anonymous';
    Object.entries({
      repo: d.repo, 'repo-id': d.repoId, category: d.category, 'category-id': d.categoryId,
      mapping: 'pathname', strict: '1', 'reactions-enabled': '1', 'emit-metadata': '0',
      'input-position': 'top', theme: 'noborder_light', lang: 'id', loading: 'lazy',
    }).forEach(([k, v]) => s.setAttribute(`data-${k}`, v));
    ghPanel.querySelector('.giscus').after(s);
  };

  const tabs = [...komen.querySelectorAll('[role="tab"]')];
  const select = (tab) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (tab.id === 'tab-github') loadGiscus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      next.focus();
      select(next);
    });
  });

  const api = komen.dataset.api.replace(/\/$/, '');
  if (!api) {
    // Tiada Worker: giscus sahaja, dimuat bila hampir kelihatan
    new IntersectionObserver(([e], io) => { if (e.isIntersecting) { io.disconnect(); loadGiscus(); } }, { rootMargin: '400px' }).observe(ghPanel);
  } else {
    const post = komen.dataset.post;
    const listEl = komen.querySelector('.komen__list');
    const form = komen.querySelector('.komen__form');
    const status = komen.querySelector('.komen__status');
    const opened = Date.now();
    const bulan = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
    const tarikh = (iso) => { const d = new Date(iso); return `${d.getDate()} ${bulan[d.getMonth()]} ${d.getFullYear()}`; };

    const say = (msg, kind = '') => {
      status.textContent = msg;
      status.className = `komen__status mono ${kind ? `is-${kind}` : 'muted'}`;
    };

    const show = (items) => {
      if (!items.length) {
        const li = document.createElement('li');
        li.className = 'komen__kosong mono muted';
        li.textContent = 'Belum ada komen. Jadi yang pertama.';
        listEl.replaceChildren(li);
        return;
      }
      listEl.replaceChildren(...items.map((k) => {
        const li = document.createElement('li');
        li.className = 'komen__item';
        const who = document.createElement('p');
        who.className = 'komen__who';
        const b = document.createElement('b');
        b.textContent = k.nama;
        const t = document.createElement('time');
        t.className = 'mono muted';
        t.dateTime = k.dibuat;
        t.textContent = tarikh(k.dibuat);
        who.append(b, t);
        const p = document.createElement('p');
        p.className = 'komen__text';
        p.textContent = k.isi;
        li.append(who, p);
        return li;
      }));
    };

    fetch(`${api}/komen?post=${encodeURIComponent(post)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((items) => { if (Array.isArray(items)) show(items); })
      .catch(() => {});

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      data.nama = (data.nama || '').trim();
      data.isi = (data.isi || '').trim();
      if (!data.nama || !data.isi) { say('Isi nama dan komen dulu.', 'err'); return; }
      const btn = form.querySelector('[type="submit"]');
      btn.disabled = true;
      say('Menghantar...');
      try {
        const r = await fetch(`${api}/komen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            post, nama: data.nama, isi: data.isi, laman: data.laman || '',
            ms: Date.now() - opened, turnstile: data['cf-turnstile-response'] || '',
          }),
        });
        const res = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(res.ralat || 'Tak berjaya hantar. Cuba lagi sekejap lagi.');
        form.reset();
        say('Terima kasih! Komen kau akan dipapar selepas disemak.', 'ok');
      } catch (err) {
        say(err.message, 'err');
      } finally {
        btn.disabled = false;
        window.turnstile?.reset();
      }
    });
  }
}
