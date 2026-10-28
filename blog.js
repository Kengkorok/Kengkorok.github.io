// /blog/: tapis ikut tag dan cari dalam semua tulisan
const list = document.querySelector('.blog .post-list');
if (list) {
  const rows = [...list.querySelectorAll('.post-row')];
  const tagBtns = [...document.querySelectorAll('.blog__tags button')];
  const search = document.querySelector('.blog__search input');
  const empty = document.querySelector('.blog__empty');
  let tag = new URLSearchParams(location.search).get('tag') || '';
  let terms = [];
  let index = null; // url -> teks penuh, dimuat bila mula menaip

  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const render = () => {
    let shown = 0;
    rows.forEach((row) => {
      const okTag = !tag || row.dataset.tags.split(' ').includes(tag);
      const hay = index?.get(row.dataset.url) ?? norm(row.textContent);
      const ok = okTag && terms.every((t) => hay.includes(t));
      row.hidden = !ok;
      if (ok) shown++;
    });
    empty.hidden = shown > 0;
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

  if (!tagBtns.some((b) => b.dataset.tag === tag)) tag = '';
  render();
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
      .then((r) => (r.ok ? r.json() : []))
      .then(show)
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
