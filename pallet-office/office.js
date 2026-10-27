// Pallet Office renderer. Paints the room on canvas, then moves one DOM actor per
// session (and per helper) around it. Fed by live.js (SSE) or replay.js (recording)
// through office.apply(msg). Sprites come from the PokeAPI sprites repo at runtime.
(function () {
  const W = 960;
  const H = 600;
  const CX = 480; // walking corridor between desks and the right-hand rooms
  const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
  const animated = (dex) => `${SPRITES}/versions/generation-v/black-white/animated/${dex}.gif`;
  const still = (dex) => `${SPRITES}/${dex}.png`;
  const WORKING = new Set(['thinking', 'reading', 'editing', 'running', 'web', 'delegating']);
  const BUBBLE = {
    idle: ['😌', 'lepak'], done: ['✅', 'siap'], thinking: ['💭', 'fikir…'], reading: ['📖', 'baca'],
    editing: ['✏️', 'edit'], running: ['⚙️', 'run'], web: ['🌐', 'web'], delegating: ['📣', 'panggil helper'],
    waiting: ['❗', 'perlukan kau'],
  };

  // Every spot has an aisle: the y it is reached along. Paths go spot -> own aisle
  // -> corridor -> target aisle -> target, so nobody walks through furniture.
  const DOOR = { x: CX, y: 650, aisle: 650 };
  const ROW_TOPS = [150, 290, 430];
  const COLS = [100, 230, 360];
  const DESKS = ROW_TOPS.flatMap((top) => COLS.map((x) => ({ x: x + 16, y: top + 14, aisle: top - 34, top, deskX: x })));
  const CENTER = [225, 275].flatMap((y) => [610, 680, 750, 820, 890].map((x) => ({ x, y, aisle: y })));
  const LOUNGE = [
    { x: 612, y: 368, aisle: 400 }, { x: 680, y: 368, aisle: 400 }, { x: 748, y: 368, aisle: 400 },
    { x: 645, y: 495, aisle: 495 }, { x: 835, y: 495, aisle: 495 }, { x: 885, y: 425, aisle: 425 },
    { x: 600, y: 565, aisle: 565 }, { x: 730, y: 570, aisle: 570 }, { x: 860, y: 565, aisle: 565 },
  ];

  // ---------- room painting ----------
  function px(ctx, color, x, y, w, h) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  function paintRoom(ctx) {
    // wood floor
    px(ctx, '#c79a68', 0, 0, W, H);
    for (let y = 96; y < H; y += 24) {
      px(ctx, '#b88b5b', 0, y, W, 2);
      for (let x = (y / 24) % 2 ? 0 : 60; x < W; x += 120) px(ctx, '#b88b5b', x, y, 2, 24);
    }
    // centre floor: pink tiles
    for (let y = 96; y < 300; y += 20) {
      for (let x = 530; x < W; x += 20) px(ctx, (x + y) / 20 % 2 ? '#f4d6dc' : '#ecc4cc', x, y, 20, 20);
    }
    // lounge rug
    px(ctx, '#5f8f5a', 570, 395, 340, 190);
    px(ctx, '#77a86f', 578, 403, 324, 174);
    for (let x = 586; x < 900; x += 16) px(ctx, '#6a9a63', x, 410, 8, 160);
    // corridor runner
    px(ctx, '#8c3b3b', CX - 26, 96, 52, H - 96);
    px(ctx, '#a34848', CX - 22, 96, 44, H - 96);
    // doormat
    px(ctx, '#3d3a4b', CX - 44, 584, 88, 16);
    px(ctx, '#5a5670', CX - 40, 588, 80, 8);

    // back wall
    px(ctx, '#efe3c8', 0, 0, W, 96);
    px(ctx, '#d9c8a5', 0, 84, W, 12);
    px(ctx, '#a8916a', 0, 92, W, 4);
    // windows
    for (const wx of [40, 200, 330]) {
      px(ctx, '#7a6a52', wx - 4, 14, 104, 60);
      px(ctx, '#9fd8f0', wx, 18, 96, 52);
      px(ctx, '#c8ecf8', wx, 18, 96, 14);
      px(ctx, '#7a6a52', wx + 46, 18, 4, 52);
    }
    // whiteboard
    px(ctx, '#6b6b6b', 456, 16, 52, 52);
    px(ctx, '#fafafa', 459, 19, 46, 46);
    px(ctx, '#4a7bd0', 464, 26, 30, 3);
    px(ctx, '#d04a4a', 464, 34, 22, 3);
    px(ctx, '#4ab06a', 464, 42, 34, 3);
    // centre sign
    px(ctx, '#c83a3a', 600, 12, 280, 56);
    px(ctx, '#e85a5a', 604, 16, 272, 48);
    px(ctx, '#fff', 616, 26, 28, 28);
    px(ctx, '#c83a3a', 627, 30, 6, 20);
    px(ctx, '#c83a3a', 620, 37, 20, 6);
    ctx.fillStyle = '#fff';
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillText('PUSAT POKéMON', 656, 46);
    // lounge clock + poster
    px(ctx, '#3d3a4b', 900, 22, 36, 36);
    px(ctx, '#fff', 904, 26, 28, 28);
    px(ctx, '#3d3a4b', 917, 30, 2, 12);
    px(ctx, '#3d3a4b', 917, 40, 9, 2);

    // labels on the floor
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillStyle = 'rgba(60,40,20,.55)';
    ctx.fillText('MEJA KERJA', 40, 118);
    ctx.fillText('SUDUT CHILL', 790, 590);
  }

  // Props that overlap actors are their own canvases with z-index = base y.
  const PROPS = [
    ...DESKS.map((d) => ({
      x: d.deskX - 48, y: d.top - 24, w: 96, h: 80,
      paint(ctx) {
        px(ctx, '#2f3340', 8, 0, 40, 28);
        px(ctx, '#454b5c', 11, 3, 34, 22);
        px(ctx, '#2f3340', 24, 28, 8, 4);
        px(ctx, '#c98d54', 0, 30, 96, 20);
        px(ctx, '#dba26a', 0, 30, 96, 3);
        px(ctx, '#9a6436', 0, 50, 96, 22);
        px(ctx, '#80522b', 0, 68, 96, 4);
        px(ctx, '#80522b', 4, 72, 6, 8);
        px(ctx, '#80522b', 86, 72, 6, 8);
        px(ctx, '#f6f1e6', 70, 21, 9, 11);
        px(ctx, '#d1c8b6', 79, 24, 3, 5);
        px(ctx, '#f9f9f9', 54, 34, 14, 10);
      },
    })),
    {
      x: 590, y: 118, w: 300, h: 64,
      paint(ctx) {
        px(ctx, '#f6f1f1', 0, 22, 300, 14);
        px(ctx, '#fff', 0, 22, 300, 3);
        px(ctx, '#e04848', 0, 36, 300, 28);
        px(ctx, '#f8f8f8', 0, 46, 300, 8);
        px(ctx, '#3d3a4b', 140, 44, 20, 12);
        px(ctx, '#f8f8f8', 144, 47, 12, 6);
      },
    },
    {
      x: 590, y: 326, w: 180, h: 56,
      paint(ctx) {
        px(ctx, '#3f5f9a', 0, 0, 180, 30);
        px(ctx, '#5577b8', 6, 4, 168, 22);
        px(ctx, '#3f5f9a', 0, 30, 180, 26);
        px(ctx, '#4d6fae', 6, 34, 52, 14);
        px(ctx, '#4d6fae', 64, 34, 52, 14);
        px(ctx, '#4d6fae', 122, 34, 52, 14);
        px(ctx, '#2e4775', 0, 50, 180, 6);
      },
    },
    {
      x: 690, y: 466, w: 100, h: 34,
      paint(ctx) {
        px(ctx, '#7a4f2a', 0, 0, 100, 14);
        px(ctx, '#94643a', 0, 0, 100, 3);
        px(ctx, '#5e3b1e', 6, 14, 6, 20);
        px(ctx, '#5e3b1e', 88, 14, 6, 20);
        px(ctx, '#fff', 40, -8, 10, 9);
        px(ctx, '#ffd36a', 60, -4, 16, 5);
      },
    },
    ...[[515, 250], [515, 440], [920, 330], [30, 560]].map(([x, y]) => ({
      x: x - 18, y: y - 48, w: 36, h: 52,
      paint(ctx) {
        px(ctx, '#3f8f4a', 4, 0, 28, 30);
        px(ctx, '#56ad5f', 10, 4, 16, 18);
        px(ctx, '#2f7038', 0, 16, 10, 14);
        px(ctx, '#2f7038', 26, 14, 10, 14);
        px(ctx, '#b0643a', 8, 30, 20, 20);
        px(ctx, '#8e4f2c', 8, 30, 20, 4);
      },
    })),
  ];

  // ---------- actors ----------
  class Actor {
    constructor(stage, { dex, label, sub, helper }) {
      this.el = document.createElement('div');
      this.el.className = 'actor' + (helper ? ' helper' : '');
      this.bubble = document.createElement('div');
      this.bubble.className = 'bubble';
      this.tag = document.createElement('div');
      this.tag.className = 'tag';
      this.tag.textContent = label;
      if (sub) {
        const small = document.createElement('small');
        small.textContent = sub;
        this.tag.append(small);
      }
      this.img = document.createElement('img');
      this.img.className = 'sprite';
      this.img.alt = label;
      this.img.referrerPolicy = 'no-referrer';
      // Grow small sprites, but keep legendaries from swallowing the room.
      const [maxScale, maxHeight] = helper ? [1, 52] : [1.4, 84];
      this.img.onload = () => {
        const scale = Math.min(maxScale, maxHeight / this.img.naturalHeight);
        this.img.style.width = `${Math.round(this.img.naturalWidth * scale)}px`;
      };
      this.img.onerror = () => { this.img.onerror = null; this.img.src = still(dex); };
      this.img.src = animated(dex);
      const shadow = document.createElement('div');
      shadow.className = 'shadow';
      const inner = document.createElement('div');
      inner.className = 'inner';
      inner.append(this.bubble, this.tag, this.img);
      this.el.append(shadow, inner);
      stage.append(this.el);
      this.x = DOOR.x;
      this.y = DOOR.y;
      this.aisle = DOOR.aisle;
      this.path = [];
      this.phase = Math.random() * 6;
      this.facingRight = false;
      this.onArrive = null;
      this.render();
    }

    say(state, detail) {
      const [icon, word] = BUBBLE[state] || BUBBLE.thinking;
      this.bubble.textContent = `${icon} ${detail || word}`;
      this.bubble.title = this.bubble.textContent;
      this.el.dataset.state = state;
    }

    place(spot) {
      this.target = spot;
      this.x = spot.x;
      this.y = spot.y;
      this.aisle = spot.aisle;
      this.path = [];
      this.render();
    }

    walkTo(spot, onArrive) {
      this.onArrive = onArrive || null;
      if (this.target === spot && this.path.length) return;
      if (!this.path.length && this.x === spot.x && this.y === spot.y) {
        this.target = spot;
        this.aisle = spot.aisle;
        return;
      }
      this.target = spot;
      const onCorridor = Math.abs(this.x - CX) < 1;
      const from = onCorridor ? this.y : this.aisle;
      const pts = [];
      if (!onCorridor && this.y !== from) pts.push({ x: this.x, y: from });
      if (from !== spot.aisle) pts.push({ x: CX, y: from }, { x: CX, y: spot.aisle });
      pts.push({ x: spot.x, y: spot.aisle }, { x: spot.x, y: spot.y });
      this.path = pts;
      this.aisle = spot.aisle;
    }

    tick(dt, t) {
      let budget = 220 * dt;
      while (budget > 0 && this.path.length) {
        const p = this.path[0];
        const dx = p.x - this.x;
        const dy = p.y - this.y;
        const dist = Math.hypot(dx, dy);
        if (Math.abs(dx) > 0.5) this.facingRight = dx > 0;
        if (dist <= budget) {
          this.x = p.x;
          this.y = p.y;
          this.path.shift();
          budget -= dist;
        } else {
          this.x += (dx / dist) * budget;
          this.y += (dy / dist) * budget;
          budget = 0;
        }
      }
      const walking = this.path.length > 0;
      this.bob = walking ? Math.abs(Math.sin(t * 12 + this.phase)) * 4 : 0;
      this.render();
      if (!walking && this.onArrive) {
        const cb = this.onArrive;
        this.onArrive = null;
        cb();
      }
    }

    render() {
      this.el.style.transform = `translate(${this.x}px, ${this.y}px)`;
      this.el.style.zIndex = Math.round(this.y);
      this.img.style.transform = `translateY(${-(this.bob || 0)}px) scaleX(${this.facingRight ? -1 : 1})`;
    }

    remove() {
      this.el.remove();
    }
  }

  // ---------- office ----------
  function createOffice(root, feedEl, opts = {}) {
    root.classList.add('office');
    const stage = document.createElement('div');
    stage.className = 'stage';
    root.append(stage);
    const bg = document.createElement('canvas');
    bg.width = W;
    bg.height = H;
    bg.className = 'bg';
    stage.append(bg);
    const paint = () => paintRoom(bg.getContext('2d'));
    paint();
    if (document.fonts) document.fonts.ready.then(paint);
    for (const p of PROPS) {
      const c = document.createElement('canvas');
      c.width = p.w;
      c.height = p.h;
      c.className = 'prop';
      c.style.transform = `translate(${p.x}px, ${p.y}px)`;
      c.style.zIndex = p.y + p.h;
      p.paint(c.getContext('2d'));
      stage.append(c);
    }
    const nurse = new Actor(stage, { dex: 113, label: 'Nurse', helper: true });
    nurse.place({ x: 740, y: 152, aisle: 152 });
    nurse.el.classList.add('nurse');

    function fit() {
      const scale = root.clientWidth / W;
      stage.style.transform = `scale(${scale})`;
      root.style.height = `${H * scale}px`;
    }
    new ResizeObserver(fit).observe(root);
    fit();

    const recs = new Map(); // session id -> { data, actor, desk, lounge, center, helpers }
    const leaving = new Set();

    const freeIndex = (key, size) => {
      const used = new Set([...recs.values()].map((r) => r[key]));
      for (let i = 0; i < size; i++) if (!used.has(i)) return i;
      return null;
    };

    function spotFor(rec) {
      const { state } = rec.data;
      if (state === 'waiting') {
        if (rec.center == null) rec.center = freeIndex('center', CENTER.length) ?? 0;
        return CENTER[rec.center];
      }
      rec.center = null;
      if (WORKING.has(state) && rec.desk != null) return DESKS[rec.desk];
      return LOUNGE[rec.lounge ?? 0];
    }

    function helperSpot(rec, i) {
      if (rec.desk == null) {
        const s = spotFor(rec);
        return { x: s.x + 34 + i * 24, y: s.y + 10, aisle: s.y + 10 };
      }
      const d = DESKS[rec.desk];
      const y = d.top + 76 + (i % 2) * 8;
      return { x: d.deskX - 34 + i * 26, y, aisle: y };
    }

    function syncHelpers(rec, instant) {
      const live = rec.data.helpers || [];
      const ids = new Set(live.map((h) => h.id));
      for (const [id, actor] of rec.helpers) {
        if (ids.has(id)) continue;
        rec.helpers.delete(id);
        leaving.add(actor);
        actor.walkTo(DOOR, () => { actor.remove(); leaving.delete(actor); });
      }
      live.forEach((h, i) => {
        let actor = rec.helpers.get(h.id);
        if (!actor) {
          actor = new Actor(stage, { dex: h.dex, label: h.pokemon, sub: h.kind, helper: true });
          rec.helpers.set(h.id, actor);
          if (instant) actor.place(helperSpot(rec, i));
        }
        actor.say(h.state, h.detail);
        if (!instant) actor.walkTo(helperSpot(rec, i));
      });
    }

    function upsert(data, instant) {
      let rec = recs.get(data.id);
      if (!rec) {
        rec = { data, helpers: new Map(), center: null };
        rec.desk = freeIndex('desk', DESKS.length);
        rec.lounge = freeIndex('lounge', LOUNGE.length) ?? recs.size % LOUNGE.length;
        recs.set(data.id, rec);
        rec.actor = new Actor(stage, { dex: data.dex, label: data.label, sub: data.project });
      }
      rec.data = data;
      rec.actor.say(data.state, data.detail);
      const spot = spotFor(rec);
      if (instant) rec.actor.place(spot);
      else rec.actor.walkTo(spot);
      syncHelpers(rec, instant);
    }

    function remove(id) {
      const rec = recs.get(id);
      if (!rec) return;
      recs.delete(id);
      for (const actor of [rec.actor, ...rec.helpers.values()]) {
        leaving.add(actor);
        actor.walkTo(DOOR, () => { actor.remove(); leaving.delete(actor); });
      }
    }

    function clear() {
      for (const rec of recs.values()) for (const a of [rec.actor, ...rec.helpers.values()]) a.remove();
      for (const a of leaving) a.remove();
      recs.clear();
      leaving.clear();
      if (feedEl) feedEl.replaceChildren();
    }

    const time = (t) => new Date(t).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' });
    function addFeed(item) {
      if (!feedEl) return;
      const li = document.createElement('li');
      li.dataset.state = item.state;
      const img = document.createElement('img');
      img.src = still(item.dex);
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      const body = document.createElement('div');
      const who = document.createElement('b');
      who.textContent = item.name;
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = `${item.project} · ${time(item.t)}`;
      const text = document.createElement('p');
      text.textContent = item.text;
      body.append(who, meta, text);
      li.append(img, body);
      feedEl.prepend(li);
      while (feedEl.children.length > 60) feedEl.lastChild.remove();
    }

    function stats() {
      const all = [...recs.values()].map((r) => r.data);
      const s = {
        total: all.length,
        waiting: all.filter((d) => d.state === 'waiting').length,
        working: all.filter((d) => WORKING.has(d.state)).length,
        helpers: all.reduce((n, d) => n + (d.helpers || []).length, 0),
      };
      if (opts.onStats) opts.onStats(s);
      return s;
    }

    function apply(msg) {
      switch (msg.type) {
        case 'snapshot':
          clear();
          msg.sessions.forEach((s) => upsert(s, true));
          msg.feed.forEach(addFeed);
          break;
        case 'session': upsert(msg.session, false); break;
        case 'leave': remove(msg.id); break;
        case 'feed': addFeed(msg.item); break;
        default: if (opts.onMessage) opts.onMessage(msg);
      }
      stats();
    }

    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      for (const rec of recs.values()) {
        rec.actor.tick(dt, t);
        for (const h of rec.helpers.values()) h.tick(dt, t);
      }
      for (const a of leaving) a.tick(dt, t);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    return { apply, clear, stats };
  }

  window.PalletOffice = { createOffice };
})();
