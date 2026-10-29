// An endless made-up workday generated in the browser. It feeds the renderer the same
// messages the server streams, so a static demo never ends or repeats itself and
// needs no recording. Each resident works in rounds (prompt, a few tools, the odd
// permission wait, a breather); four helpers stay on long background jobs.
//   PalletSim.start(PalletOffice.createOffice(...))
(function () {
  const PACE = 1.6; // same stretch as demo.js, so bubbles last long enough to read
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const between = (a, b) => a + Math.random() * (b - a);
  const chance = (p) => Math.random() < p;

  const VERB = {
    thinking: (d) => d || 'tengah fikir',
    reading: (d) => (d.startsWith('cari') ? d : `baca ${d}`),
    editing: (d) => `edit ${d}`,
    running: (d) => `jalan: ${d}`,
    web: (d) => `layari ${d}`,
    delegating: (d) => `hantar helper (${d})`,
  };

  // [state, detail] pairs, the short labels the hooks would have produced.
  const CAST = [
    { project: 'Portfolio', dex: 149, pokemon: 'Dragonite', start: 500,
      crew: [{ kind: 'Explore', dex: 16, pokemon: 'Pidgey', work: [
        ['reading', 'cari assets/*.mp4'], ['reading', 'main.js'], ['reading', 'cari dalam kod'], ['reading', 'styles.css'], ['reading', 'blog.html'],
      ] }],
      work: [
        ['reading', 'index.html'], ['editing', 'index.html'], ['editing', 'styles.css'], ['running', 'Preview laman'],
        ['editing', 'main.js'], ['reading', 'cari dalam kod'], ['running', 'Commit tweak animasi'], ['editing', 'blog.html'],
      ],
      asks: ['Bash'] },
    { project: 'Masjid MTU', dex: 334, pokemon: 'Altaria', start: 2500,
      crew: [{ kind: 'code-reviewer', dex: 19, pokemon: 'Rattata', work: [
        ['reading', 'jadual-solat.tsx'], ['reading', 'kuliah-mingguan.tsx'], ['reading', 'cari dalam kod'], ['reading', 'page.tsx'],
      ] }],
      work: [
        ['reading', 'page.tsx'], ['editing', 'jadual-solat.tsx'], ['running', 'Run test'], ['editing', 'kuliah-mingguan.tsx'],
        ['running', 'Build preview'], ['reading', 'cari dalam kod'], ['editing', 'derma.tsx'],
      ],
      fails: true },
    { project: 'Ship Dashboard', dex: 384, pokemon: 'Rayquaza', start: 4500,
      crew: [
        { kind: 'Explore', dex: 10, pokemon: 'Caterpie', work: [
          ['reading', 'cari **/*.yml'], ['reading', 'compose.yaml'], ['reading', 'cari dalam kod'], ['reading', 'Dockerfile'],
        ] },
        { kind: 'general-purpose', dex: 129, pokemon: 'Magikarp', work: [
          ['web', 'docs.docker.com'], ['reading', 'ingest.js'], ['running', 'Semak log'], ['web', 'casaos.io'],
        ] },
      ],
      work: [
        ['thinking', 'susun plan'], ['editing', 'ingest.js'], ['reading', 'dashboard.html'], ['editing', 'dashboard.html'],
        ['running', 'Deploy ke CasaOS'], ['running', 'Semak container'],
      ],
      asks: ['Bash'] },
    { project: 'PoGo Wave Radar', dex: 81, pokemon: 'Magnemite', start: 7000,
      work: [
        ['web', 'pokemon go spotlight hour'], ['web', 'leekduck.com'], ['reading', 'parser.ts'], ['editing', 'waves.ts'],
        ['running', 'Build radar'], ['reading', 'cari dalam kod'],
      ] },
    { project: 'Buku Mewarna', dex: 235, pokemon: 'Smeargle', start: 9500,
      work: [
        ['reading', 'canvas.js'], ['editing', 'palette.js'], ['editing', 'kucing.svg'], ['running', 'Cuba warna kucing'],
        ['editing', 'canvas.js'], ['reading', 'cari dalam kod'],
      ],
      asks: ['Write'] },
    { project: 'Pallet Office', dex: 132, pokemon: 'Ditto', start: 12000,
      work: [
        ['reading', 'server.js'], ['editing', 'office.js'], ['editing', 'office.css'], ['running', 'Main demo'],
        ['editing', 'sim.js'], ['reading', 'cari dalam kod'],
      ] },
    { project: 'Home', dex: 143, pokemon: 'Snorlax', start: 15000,
      work: [['running', 'Semak storan'], ['running', 'Semak container'], ['reading', '.zshrc'], ['editing', '.zshrc'], ['running', 'Update sistem']],
      nudges: true },
  ];

  function start(office) {
    let seq = 0;
    const residents = CAST.map((c) => ({
      ...c, id: `res:${c.project}`, label: c.pokemon, state: 'idle', detail: '',
      since: Date.now(), changedAt: Date.now(), tools: Math.floor(between(0, 40)), helpers: [],
    }));
    const level = (r) => 5 + Math.floor(r.tools / 8);

    const pub = (r) => ({
      id: r.id, label: r.label, project: r.project, dex: r.dex, pokemon: r.pokemon, permanent: true, live: true,
      lv: level(r), state: r.state, detail: r.detail, since: r.since, changedAt: r.changedAt,
      helpers: r.helpers.map((h) => ({ id: h.id, dex: h.dex, pokemon: h.pokemon, kind: h.kind, state: h.state, detail: h.detail })),
    });
    const changed = (r) => office.apply({ type: 'session', session: pub(r) });
    const feed = (r, text, who = r) => office.apply({ type: 'feed', item: {
      t: Date.now(), sid: r.id, name: who.label, dex: who.dex, project: r.project, state: who.state, text,
    } });
    function set(who, state, detail = '') {
      if (who.state !== state) who.changedAt = Date.now();
      who.state = state;
      who.detail = detail;
    }

    // Pick a step, but never the same one twice running.
    function next(who, list) {
      let step;
      do step = list[Math.floor(Math.random() * list.length)];
      while (list.length > 1 && step === who.last);
      who.last = step;
      return step;
    }

    async function tool(r, who = r) {
      const [state, detail] = next(who, who.work);
      set(who, state, detail);
      feed(r, VERB[state](detail), who);
      const lv = level(r);
      r.tools++;
      changed(r);
      if (level(r) > lv) feed(r, `naik ke Lv ${level(r)}! 🎉`);
      await sleep(between(1200, 3000) * PACE);
      if (r.fails && state === 'running' && who === r && chance(0.2)) feed(r, 'Bash tak jadi');
      set(who, 'thinking', '');
      changed(r);
      await sleep(between(400, 900));
    }

    async function crew(r, mate, i) {
      await sleep(400 + i * 600);
      feed(r, `helper ${mate.kind} masuk kerja`, mate);
      for (;;) {
        await tool(r, mate);
        await sleep(between(800, 2000));
      }
    }

    async function hire(r) {
      for (const c of r.crew) {
        set(r, 'delegating', c.kind);
        const mate = { ...c, id: `h${++seq}`, label: c.pokemon, state: 'thinking', detail: c.kind };
        r.helpers.push(mate);
        feed(r, VERB.delegating(c.kind));
        r.tools++;
        changed(r);
        await sleep(1500);
      }
      set(r, 'thinking', '');
      changed(r);
      r.helpers.forEach((mate, i) => crew(r, mate, i));
    }

    async function life(r) {
      await sleep(r.start);
      for (let round = 0; ; round++) {
        set(r, 'thinking', '');
        feed(r, 'dapat arahan baru');
        changed(r);
        await sleep(5000); // time to stroll back to the desk
        if (r.crew && round === 0) await hire(r);
        const steps = 2 + Math.floor(between(0, 3));
        for (let i = 0; i < steps; i++) await tool(r);
        if (r.asks && chance(0.35)) {
          const name = r.asks[Math.floor(Math.random() * r.asks.length)];
          set(r, 'waiting', `izin ${name}`);
          feed(r, `minta izin guna ${name} — perlukan kau!`);
          changed(r);
          await sleep(between(8000, 11000));
          await tool(r);
        }
        if (r.nudges && chance(0.4)) {
          set(r, 'waiting', 'tunggu arahan kau');
          feed(r, 'perlukan kau: tunggu arahan kau');
          changed(r);
          await sleep(between(7000, 10000));
          continue;
        }
        set(r, 'done', 'siap');
        feed(r, 'siap, tunggu arahan seterusnya');
        changed(r);
        await sleep(between(3000, 6000));
      }
    }

    office.apply({ type: 'snapshot', sessions: residents.map(pub), feed: [] });
    residents.forEach(life);
  }

  window.PalletSim = { start };
})();
