// Pallet Office renderer: an isometric island painted on canvas, with one DOM actor
// per Pokémon. Residents (the projects in config.json) live here all the time and
// wander when idle; sessions only change where they go and what their bubble says.
// Fed by live.js (SSE) or replay.js (recording) through office.apply(msg).
(function () {
  const N = 26; // tiles per side
  const TW = 64;
  const TH = 32;
  const CLIFF = 46;
  const HEAD = 150; // headroom above the top tile for walls, trees and roofs
  const W = N * TW;
  const H = HEAD + N * TH + CLIFF + 24;
  const OX = W / 2;
  const WALK_SPEED = 2.4; // tiles per second, an unhurried stroll
  const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
  const animated = (dex) => `${SPRITES}/versions/generation-v/black-white/animated/${dex}.gif`;
  const still = (dex) => `${SPRITES}/${dex}.png`;
  const WORKING = new Set(['thinking', 'reading', 'editing', 'running', 'web', 'delegating']);
  const BUBBLE = {
    done: ['✅', 'siap'], thinking: ['💭', 'fikir…'], reading: ['📖', 'baca'], editing: ['✏️', 'edit'],
    running: ['⚙️', 'run'], web: ['🌐', 'web'], delegating: ['📣', 'panggil helper'], waiting: ['❗', 'perlukan kau'],
  };

  // Tile (x, y, height z) -> stage pixels. x runs down-right, y runs down-left.
  const P = (x, y, z = 0) => [OX + ((x - y) * TW) / 2, HEAD + ((x + y) * TH) / 2 - z];

  function rng(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- the map ----------
  // Island outline: first and last land x for rows y = 1..24.
  const LEFT = [5, 3, 2, 2, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 2, 3, 4, 6];
  const RIGHT = [21, 23, 24, 24, 24, 24, 24, 23, 23, 24, 24, 24, 24, 24, 23, 23, 24, 24, 24, 24, 23, 22, 20, 18];
  const isLand = (x, y) => y >= 1 && y <= 24 && x >= LEFT[y - 1] && x <= RIGHT[y - 1];
  const inRect = (x, y, [x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1;

  const OFFICE = [3, 3, 14, 13];
  const CARPET = [4, 4, 13, 12];
  const PLAZA = [15, 18, 21, 22];
  const PC = [16, 15, 20, 18];
  const WARUNG = [3, 16, 6, 18];
  const WAKAF = [3, 20, 5, 22];
  // Handed out in this order so the first few Pokémon spread across the room.
  const DESKS = [[5, 5], [8, 8], [11, 11], [11, 5], [5, 11], [8, 5], [5, 8], [11, 8], [8, 11]]
    .map(([c, r]) => ({ c, r, spot: { x: c + 0.5, y: r - 0.5 } }));
  const WAIT_SLOTS = [[16, 19], [17, 19], [19, 19], [20, 19], [16, 20], [17, 20], [18, 20], [19, 20], [20, 20], [17, 21], [18, 21]]
    .map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 }));
  const NURSE = { x: 15.5, y: 18.5 };
  const TABLES = [[7, 15], [11, 17], [8, 21]];
  const PINES = [[15, 1], [18, 1], [4, 1], [1, 6], [14, 10], [16, 12], [22, 11], [24, 13], [23, 16], [21, 22], [13, 23], [6, 24], [2, 15], [1, 18], [20, 13], [12, 14]];
  const PALMS = [[2, 19], [10, 22], [15, 9], [23, 10], [13, 19], [22, 2]];

  const type = []; // y -> x -> tile kind
  const blocked = new Set();
  const key = (x, y) => `${x},${y}`;
  const block = (x, y) => blocked.add(key(x, y));

  for (let y = 0; y < N; y++) {
    type[y] = [];
    for (let x = 0; x < N; x++) {
      let t = isLand(x, y) ? 'g' : 'v';
      if (t === 'g') {
        const dx = (x + 0.5 - 21.5) / 3.6;
        const dy = (y + 0.5 - 6) / 3.2;
        if (dx * dx + dy * dy <= 1) t = 'w';
        if (inRect(x, y, OFFICE)) t = inRect(x, y, CARPET) ? 'c' : 'f';
        if (inRect(x, y, PLAZA)) t = 'k';
      }
      type[y][x] = t;
    }
  }
  const at = (x, y) => (type[y] && type[y][x]) || 'v';
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (at(x, y) !== 'g') continue;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (at(x + i, y + j) === 'w') type[y][x] = 's';
    }
  }
  for (let x = 18; x <= 20; x++) if (at(x, 6) === 'w') type[6][x] = 'j';
  for (let y = 13; y <= 18; y++) type[y][9] = 'p';
  for (let x = 4; x <= 8; x++) type[18][x] = 'p';
  for (let x = 10; x <= 14; x++) type[19][x] = 'p';
  for (let x = 14; x <= 17; x++) if (at(x, 6) !== 'w') type[6][x] = 'p';

  // What can't be walked on: void, water, everything behind the office walls,
  // furniture, and a ring around buildings so depth sorting stays honest.
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const t = at(x, y);
      if (t === 'v' || t === 'w') block(x, y);
      if ((y < 3 && x < 15) || (x < 3 && y < 14)) block(x, y);
    }
  }
  const blockRect = ([x0, y0, x1, y1]) => {
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) block(x, y);
  };
  const blockBuilding = (r) => {
    blockRect(r);
    blockRect([r[0] - 1, r[1] - 1, r[2] + 1, r[1]]);
    blockRect([r[0] - 1, r[1], r[0], r[3]]);
  };
  blockRect([0, 14, 3, N]); // the strip behind the warung and wakaf
  DESKS.forEach((d) => blockRect([d.c, d.r, d.c + 2, d.r + 1]));
  [PC, WARUNG, WAKAF].forEach(blockBuilding);
  blockRect([PC[2], PC[1], PC[2] + 1, PC[3]]); // hedge along the centre's right wall
  [[6, 3], [7, 3], [12, 3], [3, 3], [10, 3], [3, 11], [6, 16], [16, 9]].forEach(([x, y]) => block(x, y));
  block(Math.floor(NURSE.x), Math.floor(NURSE.y));
  TABLES.forEach(([x, y]) => block(x, y));
  const trees = [...PINES.map((p) => [...p, 'pine']), ...PALMS.map((p) => [...p, 'palm'])]
    .filter(([x, y]) => 'gs'.includes(at(x, y)) && !blocked.has(key(x, y)));
  trees.forEach(([x, y]) => block(x, y));

  const walkable = (x, y) => !blocked.has(key(x, y));
  const WAIT_KEYS = new Set(WAIT_SLOTS.map((s) => key(Math.floor(s.x), Math.floor(s.y))));
  const ROAM = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (walkable(x, y) && 'gspjk'.includes(at(x, y)) && !WAIT_KEYS.has(key(x, y)) && !(x <= 14 && y <= 12)) ROAM.push({ x: x + 0.5, y: y + 0.5 });
    }
  }
  const SPAWN = { x: 9.5, y: 17.5 };

  // Breadth-first path over the tile grid; returns tile centres, then the exact spot.
  function route(from, to) {
    const sx = Math.floor(from.x);
    const sy = Math.floor(from.y);
    const tx = Math.floor(to.x);
    const ty = Math.floor(to.y);
    const prev = new Map([[key(sx, sy), null]]);
    const queue = [[sx, sy]];
    while (queue.length) {
      const [x, y] = queue.shift();
      if (x === tx && y === ty) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        const k = key(nx, ny);
        if (prev.has(k) || (!walkable(nx, ny) && !(nx === tx && ny === ty))) continue;
        prev.set(k, [x, y]);
        queue.push([nx, ny]);
      }
    }
    if (!prev.has(key(tx, ty))) return [{ x: to.x, y: to.y }];
    const pts = [];
    for (let p = [tx, ty]; p && !(p[0] === sx && p[1] === sy); p = prev.get(key(p[0], p[1]))) pts.unshift({ x: p[0] + 0.5, y: p[1] + 0.5 });
    if (pts.length) pts[pts.length - 1] = { x: to.x, y: to.y };
    else pts.push({ x: to.x, y: to.y });
    return pts;
  }

  // ---------- painting helpers ----------
  function poly(ctx, color, pts, seam = true) {
    ctx.fillStyle = color;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
    if (seam) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  const diamond = (x0, y0, x1, y1, z = 0) => [P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)];
  // Cuboid on footprint [x0,y0)-[x1,y1), from height z0 to z0+h. Faces: top, south-west, south-east.
  function box(ctx, x0, y0, x1, y1, z0, h, [top, left, right]) {
    poly(ctx, left, [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z0 + h), P(x0, y1, z0 + h)]);
    poly(ctx, right, [P(x1, y1, z0), P(x1, y0, z0), P(x1, y0, z0 + h), P(x1, y1, z0 + h)]);
    poly(ctx, top, diamond(x0, y0, x1, y1, z0 + h));
  }
  // Rectangles painted onto a wall plane: the south-west face (y fixed) or south-east face (x fixed).
  const onSW = (ctx, color, y, xa, xb, za, zb) => poly(ctx, color, [P(xa, y, za), P(xb, y, za), P(xb, y, zb), P(xa, y, zb)], false);
  const onSE = (ctx, color, x, ya, yb, za, zb) => poly(ctx, color, [P(x, ya, za), P(x, yb, za), P(x, yb, zb), P(x, ya, zb)], false);

  const TILE = {
    g: ['#6cb04f', '#72b654'], s: ['#ead69e', '#e4cf94'], f: ['#c99a63', '#c2915a'], c: ['#7f91a8', '#7a8ca3'],
    p: ['#cfa970', '#c8a167'], k: ['#d5cfc3', '#cbc5b8'], w: ['#3f8fd0', '#3a88c8'], j: ['#3f8fd0', '#3a88c8'],
  };

  function paintGround(ctx) {
    const rand = rng(7);
    for (let s = 0; s < 2 * N; s++) {
      for (let x = 0; x < N; x++) {
        const y = s - x;
        if (y < 0 || y >= N || at(x, y) === 'v') continue;
        const t = at(x, y);
        poly(ctx, TILE[t][(x + y) % 2], diamond(x, y, x + 1, y + 1));
        const [cx, cy] = P(x + 0.5, y + 0.5);
        if (t === 'g') {
          const r = rand();
          if (r < 0.35) poly(ctx, '#5e9f43', [[cx - 6, cy + 2], [cx - 4, cy - 4], [cx - 2, cy + 2]], false);
          if (r > 0.9) {
            ctx.fillStyle = ['#fff6c8', '#ffd1e0', '#fffefe'][Math.floor(rand() * 3)];
            ctx.fillRect(cx + 4, cy - 2, 3, 3);
            ctx.fillRect(cx - 9, cy + 4, 3, 3);
          }
        } else if (t === 'w' || t === 'j') {
          ctx.fillStyle = '#7cc3ee';
          if (rand() < 0.5) ctx.fillRect(cx - 8 + rand() * 10, cy - 3 + rand() * 6, 8, 2);
          if (t === 'j') {
            box(ctx, x + 0.05, y + 0.2, x + 0.95, y + 0.8, 0, 4, ['#b07d4c', '#8d6038', '#7a512f']);
            for (let i = 0.2; i < 0.9; i += 0.17) poly(ctx, '#946538', [P(x + i, y + 0.2, 4), P(x + i + 0.02, y + 0.2, 4), P(x + i + 0.02, y + 0.8, 4), P(x + i, y + 0.8, 4)], false);
          }
        } else if (t === 'k') {
          ctx.fillStyle = 'rgba(0,0,0,.06)';
          ctx.fillRect(cx - 1, cy - 8, 2, 16);
        } else if (t === 'f') {
          poly(ctx, '#b88550', [P(x, y + 0.5), P(x + 1, y + 0.5)], false);
        }
        paintCliff(ctx, x, y);
      }
    }
    // pokéball ring painted on the plaza
    const [px, py] = P(18, 20.5);
    ctx.strokeStyle = '#e25555';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(px, py, 58, 29, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  function paintCliff(ctx, x, y) {
    const water = at(x, y) === 'w' || at(x, y) === 'j';
    if (!isLand(x, y + 1)) {
      poly(ctx, water ? '#68b2e2' : '#7a5236', [P(x, y + 1), P(x + 1, y + 1), P(x + 1, y + 1, -CLIFF), P(x, y + 1, -CLIFF)]);
      if (!water) {
        poly(ctx, '#4e8a38', [P(x, y + 1), P(x + 1, y + 1), P(x + 1, y + 1, -5), P(x, y + 1, -5)], false);
        poly(ctx, '#684530', [P(x, y + 1, -24), P(x + 1, y + 1, -24), P(x + 1, y + 1, -28), P(x, y + 1, -28)], false);
      }
    }
    if (!isLand(x + 1, y)) {
      poly(ctx, water ? '#5aa6d8' : '#5f3f29', [P(x + 1, y + 1), P(x + 1, y), P(x + 1, y, -CLIFF), P(x + 1, y + 1, -CLIFF)]);
      if (water) {
        ctx.fillStyle = 'rgba(255,255,255,.7)';
        for (let i = 0.15; i < 1; i += 0.3) {
          const [sx, sy] = P(x + 1, y + i);
          ctx.fillRect(sx, sy, 2, CLIFF - 6);
        }
      } else {
        poly(ctx, '#447a31', [P(x + 1, y + 1), P(x + 1, y), P(x + 1, y, -5), P(x + 1, y + 1, -5)], false);
        poly(ctx, '#523625', [P(x + 1, y + 1, -24), P(x + 1, y, -24), P(x + 1, y, -28), P(x + 1, y + 1, -28)], false);
      }
    }
  }

  function paintWalls(ctx) {
    const [x0, y0, x1, y1] = OFFICE;
    const WALL = 66;
    box(ctx, x0, y0 - 0.22, x1, y0, 0, WALL, ['#cdb892', '#efe4cc', '#d9c9a8']);
    box(ctx, x0 - 0.22, y0, x0, y1, 0, WALL, ['#cdb892', '#e6d8bb', '#e6d8bb']);
    box(ctx, x0 - 0.22, y0 - 0.22, x0, y0, 0, WALL, ['#cdb892', '#efe4cc', '#d9c9a8']);
    for (let x = x0 + 0.6; x < x1 - 1; x += 2.2) {
      onSW(ctx, '#8a7556', y0, x - 0.08, x + 1.08, 24, 52);
      onSW(ctx, '#a9dcf2', y0, x, x + 1, 27, 49);
      onSW(ctx, '#d4effa', y0, x, x + 1, 41, 49);
      onSW(ctx, '#8a7556', y0, x + 0.48, x + 0.52, 27, 49);
    }
    for (let y = y0 + 0.8; y < y1 - 1; y += 2.6) {
      onSE(ctx, '#8a7556', x0, y - 0.08, y + 1.08, 24, 52);
      onSE(ctx, '#a9dcf2', x0, y, y + 1, 27, 49);
      onSE(ctx, '#d4effa', x0, y, y + 1, 41, 49);
    }
    onSW(ctx, '#ad9a7a', y0, x0, x1, 0, 6);
    onSE(ctx, '#ad9a7a', x0, y0, y1, 0, 6);
    // whiteboard on the back wall
    onSW(ctx, '#6b6b6b', y0, 10.9, 12.9, 22, 50);
    onSW(ctx, '#fafafa', y0, 11, 12.8, 24, 48);
    onSW(ctx, '#4a7bd0', y0, 11.2, 12.2, 40, 42);
    onSW(ctx, '#d04a4a', y0, 11.2, 12.5, 34, 36);
    onSW(ctx, '#4ab06a', y0, 11.2, 11.9, 28, 30);
    // signboard over the back wall
    const [sx, sy] = P(8.5, y0 - 0.2, WALL + 30);
    ctx.fillStyle = '#3d2c1e';
    ctx.fillRect(sx - 92, sy - 4, 184, 30);
    ctx.fillStyle = '#5a412c';
    ctx.fillRect(sx - 88, sy, 176, 22);
    ctx.fillStyle = '#ffd25a';
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PALLET OFFICE', sx, sy + 17);
    ctx.fillStyle = '#3d2c1e';
    ctx.fillRect(sx - 60, sy + 26, 4, 10);
    ctx.fillRect(sx + 56, sy + 26, 4, 10);
  }

  // ---------- props: canvases sorted against actors by depth ----------
  const depthZ = (sum) => Math.round(sum * 100);

  function prop(stage, [x0, y0, x1, y1], top, paint) {
    const pts = [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
    const minX = Math.floor(Math.min(...pts.map((p) => p[0]))) - 30;
    const maxX = Math.ceil(Math.max(...pts.map((p) => p[0]))) + 30;
    const minY = Math.floor(Math.min(...pts.map((p) => p[1]))) - top - 10;
    const maxY = Math.ceil(Math.max(...pts.map((p) => p[1]))) + 6;
    const c = document.createElement('canvas');
    c.width = maxX - minX;
    c.height = maxY - minY;
    c.className = 'prop';
    c.style.transform = `translate(${minX}px, ${minY}px)`;
    c.style.zIndex = depthZ(Math.ceil(x1) + Math.ceil(y1) - 1);
    const ctx = c.getContext('2d');
    ctx.translate(-minX, -minY);
    paint(ctx);
    stage.append(c);
  }

  function pine(ctx, x, y, rand) {
    box(ctx, x + 0.42, y + 0.42, x + 0.58, y + 0.58, 0, 16, ['#6e4a2c', '#7a5232', '#5e3f25']);
    const [cx, cy] = P(x + 0.5, y + 0.5);
    const tall = 0.85 + rand() * 0.3;
    [[30, 14, 40], [24, 38, 34], [17, 60, 28]].forEach(([w, z, h]) => {
      const zz = z * tall;
      poly(ctx, '#3f8a3e', [[cx - w, cy - zz], [cx, cy - zz - h * tall], [cx, cy - zz + 6]], false);
      poly(ctx, '#2f6f33', [[cx + w, cy - zz], [cx, cy - zz - h * tall], [cx, cy - zz + 6]], false);
      poly(ctx, '#55a24f', [[cx - w + 8, cy - zz - 4], [cx - 2, cy - zz - h * tall + 8], [cx - 4, cy - zz - 2]], false);
    });
  }

  function palm(ctx, x, y) {
    const [cx, cy] = P(x + 0.5, y + 0.5);
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = i % 2 ? '#8c6a43' : '#9e7a4f';
      ctx.fillRect(cx - 4 + Math.sin(i / 3) * 6, cy - 8 - i * 8, 8, 9);
    }
    const tx = cx + Math.sin(3) * 6;
    const ty = cy - 80;
    [[-34, 10], [34, 10], [-26, -12], [26, -12], [0, -20], [-14, 18], [14, 18]].forEach(([dx, dy], i) => {
      poly(ctx, i % 2 ? '#3f8a3e' : '#4f9d47', [[tx, ty - 3], [tx + dx, ty + dy], [tx + dx * 0.6, ty + dy + 7], [tx, ty + 4]], false);
    });
    ctx.fillStyle = '#6b4a22';
    ctx.fillRect(tx - 6, ty + 2, 6, 6);
    ctx.fillRect(tx + 1, ty + 4, 6, 6);
  }

  function paintProps(stage) {
    const rand = rng(11);
    DESKS.forEach(({ c, r }) => prop(stage, [c, r, c + 2, r + 1], 50, (ctx) => {
      box(ctx, c + 0.05, r + 0.15, c + 1.95, r + 0.85, 0, 16, ['#d2a06a', '#a7713f', '#8c5d33']);
      box(ctx, c + 0.3, r + 0.2, c + 0.7, r + 0.4, 16, 2, ['#e8e8e8', '#bdbdbd', '#a8a8a8']);
      box(ctx, c + 0.25, r + 0.55, c + 1.05, r + 0.65, 18, 22, ['#3a3f4d', '#2c303b', '#242833']);
      box(ctx, c + 0.6, r + 0.6, c + 0.7, r + 0.7, 16, 4, ['#2c303b', '#2c303b', '#242833']);
      box(ctx, c + 1.4, r + 0.3, c + 1.55, r + 0.45, 16, 7, ['#f6f1e6', '#e6dccb', '#d1c8b6']);
      box(ctx, c + 1.25, r + 0.55, c + 1.75, r + 0.75, 16, 2, ['#fafafa', '#ddd', '#ccc']);
    }));
    prop(stage, [6, 3, 8, 4], 60, (ctx) => {
      box(ctx, 6, 3.05, 8, 3.5, 0, 50, ['#8d5d34', '#a46d3e', '#7d522d']);
      ['#d65b5b', '#5b8ed6', '#e8c35a', '#62b07a', '#9a6bd0'].forEach((col, i) => {
        onSW(ctx, col, 3.5, 6.15 + i * 0.35, 6.4 + i * 0.35, 6, 20);
        onSW(ctx, col, 3.5, 6.2 + ((i + 2) % 5) * 0.35, 6.42 + ((i + 2) % 5) * 0.35, 28, 44);
      });
    });
    prop(stage, [12, 3, 13, 4], 70, (ctx) => {
      box(ctx, 12.1, 3.1, 12.9, 3.7, 0, 58, ['#3a3f4d', '#2c303b', '#20242d']);
      for (let z = 8; z < 56; z += 7) {
        onSW(ctx, '#1b1e25', 3.7, 12.2, 12.8, z, z + 4);
        onSW(ctx, z % 14 ? '#5ad19a' : '#ffcb3d', 3.7, 12.65, 12.72, z + 1, z + 3);
      }
    });
    [[3, 3], [10, 3]].forEach(([x, y]) => prop(stage, [x, y, x + 1, y + 1], 50, (ctx) => {
      box(ctx, x + 0.3, y + 0.3, x + 0.7, y + 0.7, 0, 12, ['#7a4a2e', '#b0643a', '#8e4f2c']);
      const [cx, cy] = P(x + 0.5, y + 0.5, 30);
      ctx.fillStyle = '#3f8a3e';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 16, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#56ad5f';
      ctx.beginPath();
      ctx.ellipse(cx - 4, cy - 5, 9, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }));
    prop(stage, [3, 11, 4, 12], 50, (ctx) => {
      box(ctx, 3.25, 11.25, 3.75, 11.75, 0, 26, ['#f2f2f2', '#e2e2e2', '#cfcfcf']);
      box(ctx, 3.32, 11.32, 3.68, 11.68, 26, 16, ['#bfe6ff', '#8fd0f5', '#6fb8e8']);
    });

    // Pokémon Centre
    prop(stage, PC, 120, (ctx) => {
      const [x0, y0, x1, y1] = PC;
      box(ctx, x0, y0, x1, y1, 0, 54, ['#f4efe6', '#f0e9dc', '#d9cfbf']);
      onSW(ctx, '#e04848', y1, x0, x1, 40, 54);
      onSE(ctx, '#c43c3c', x1, y1, y0, 40, 54);
      onSW(ctx, '#38507a', y1, 17.55, 18.45, 0, 32);
      onSW(ctx, '#7fb3e6', y1, 17.65, 18.35, 6, 28);
      onSW(ctx, '#38507a', y1, 17.98, 18.02, 0, 32);
      [16.35, 18.95].forEach((x) => {
        onSW(ctx, '#8a8a8a', y1, x - 0.05, x + 0.75, 14, 36);
        onSW(ctx, '#a9dcf2', y1, x, x + 0.7, 16, 34);
      });
      [15.5, 16.9].forEach((y) => {
        onSE(ctx, '#7a7a7a', x1, y - 0.05, y + 0.75, 14, 36);
        onSE(ctx, '#8fc4e0', x1, y, y + 0.7, 16, 34);
      });
      box(ctx, x0 - 0.25, y0 - 0.25, x1 + 0.25, y1 + 0.25, 54, 12, ['#e25555', '#c43c3c', '#a83232']);
      box(ctx, x0 + 0.4, y0 + 0.4, x1 - 0.4, y1 - 0.4, 66, 6, ['#ea6a6a', '#c43c3c', '#a83232']);
      const [cx, cy] = P((x0 + x1) / 2, (y0 + y1) / 2, 72);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 26, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e04848';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 26, 13, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2b2b2b';
      ctx.fillRect(cx - 26, cy - 1, 52, 3);
      ctx.beginPath();
      ctx.ellipse(cx, cy, 7, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 4, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    for (let y = PC[1]; y < PC[3]; y++) prop(stage, [PC[2], y, PC[2] + 1, y + 1], 20, (ctx) => {
      box(ctx, PC[2] + 0.15, y + 0.05, PC[2] + 0.85, y + 0.95, 0, 14, ['#5fa94e', '#4f9442', '#417d36']);
    });

    // Warung
    prop(stage, WARUNG, 110, (ctx) => {
      const [x0, y0, x1, y1] = WARUNG;
      box(ctx, x0, y0, x1, y1, 0, 42, ['#d9a066', '#c48a52', '#9a6638']);
      onSW(ctx, '#3d2c1e', y1, x0 + 0.4, x1 - 0.4, 14, 34);
      onSW(ctx, '#f1c27d', y1, x0 + 0.5, x1 - 0.5, 16, 32);
      onSW(ctx, '#8d5d34', y1, x0 + 0.3, x1 - 0.3, 12, 16);
      ['#ff9f43', '#e8e1c7', '#c0603a'].forEach((col, i) => onSW(ctx, col, y1, x0 + 0.8 + i * 0.5, x0 + 1.05 + i * 0.5, 16, 24));
      box(ctx, x0 - 0.2, y0 - 0.2, x1 + 0.2, y1 + 0.55, 42, 5, ['#b8c2c9', '#8d979e', '#7b858c']);
      for (let x = x0 - 0.2; x < x1 + 0.2; x += 0.5) onSW(ctx, Math.round((x - x0) * 2) % 2 ? '#e25555' : '#fff', y1 + 0.55, x, x + 0.5, 34, 42);
      const [sx, sy] = P((x0 + x1) / 2, (y0 + y1) / 2, 78);
      ctx.fillStyle = '#3d2c1e';
      ctx.fillRect(sx - 54, sy - 2, 108, 24);
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(sx - 51, sy + 1, 102, 18);
      ctx.fillStyle = '#fff';
      ctx.font = '9px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('WARUNG', sx, sy + 14);
    });
    prop(stage, [6, 16, 7, 17], 40, (ctx) => {
      box(ctx, 6.2, 16.2, 6.8, 16.8, 0, 28, ['#e9f2f6', '#d6e4ea', '#b9ccd4']);
      onSW(ctx, '#7fc8e8', 16.8, 6.28, 6.72, 8, 24);
    });

    // Wakaf
    prop(stage, WAKAF, 110, (ctx) => {
      const [x0, y0, x1, y1] = WAKAF;
      box(ctx, x0 + 0.1, y0 + 0.1, x1 - 0.1, y1 - 0.1, 0, 10, ['#c79458', '#a7713f', '#8c5d33']);
      [[x0 + 0.1, y0 + 0.1], [x1 - 0.25, y0 + 0.1], [x0 + 0.1, y1 - 0.25], [x1 - 0.25, y1 - 0.25]].forEach(([x, y]) => box(ctx, x, y, x + 0.15, y + 0.15, 10, 40, ['#6a3f22', '#7a4a2a', '#5e3820']));
      const apex = P((x0 + x1) / 2, (y0 + y1) / 2, 84);
      const e = 0.3;
      poly(ctx, '#a35a32', [P(x0 - e, y0 - e, 50), P(x1 + e, y0 - e, 50), apex]);
      poly(ctx, '#b4663b', [P(x0 - e, y0 - e, 50), P(x0 - e, y1 + e, 50), apex]);
      poly(ctx, '#8b4a2b', [P(x0 - e, y1 + e, 50), P(x1 + e, y1 + e, 50), apex]);
      poly(ctx, '#6e3820', [P(x1 + e, y1 + e, 50), P(x1 + e, y0 - e, 50), apex]);
    });

    TABLES.forEach(([x, y]) => prop(stage, [x, y, x + 1, y + 1], 80, (ctx) => {
      box(ctx, x + 0.25, y + 0.25, x + 0.75, y + 0.75, 0, 14, ['#f0e6d2', '#d8ccb4', '#c2b59b']);
      box(ctx, x + 0.38, y + 0.4, x + 0.46, y + 0.48, 14, 7, ['#c98a4b', '#e0a865', '#b07433']);
      box(ctx, x + 0.48, y + 0.48, x + 0.52, y + 0.52, 14, 44, ['#ddd', '#bbb', '#999']);
      const apex = P(x + 0.5, y + 0.5, 66);
      const r = 0.62;
      const ring = [[x + 0.5 - r, y + 0.5], [x + 0.5, y + 0.5 - r], [x + 0.5 + r, y + 0.5], [x + 0.5, y + 0.5 + r]].map(([a, b]) => P(a, b, 52));
      ['#f2f2f2', '#e25555', '#e25555', '#f2f2f2'].forEach((col, i) => poly(ctx, col, [ring[i], ring[(i + 1) % 4], apex]));
    }));

    prop(stage, [16, 9, 17, 10], 30, (ctx) => {
      box(ctx, 16.1, 9.3, 16.9, 9.7, 8, 4, ['#b07d4c', '#8d6038', '#7a512f']);
      box(ctx, 16.15, 9.35, 16.25, 9.65, 0, 8, ['#5e3f25', '#5e3f25', '#4a3120']);
      box(ctx, 16.75, 9.35, 16.85, 9.65, 0, 8, ['#5e3f25', '#5e3f25', '#4a3120']);
    });

    trees.forEach(([x, y, kind]) => prop(stage, [x, y, x + 1, y + 1], 140, (ctx) => (kind === 'pine' ? pine(ctx, x, y, rand) : palm(ctx, x, y))));
  }

  // ---------- actors ----------
  class Actor {
    constructor(stage, { dex, tag, helper }) {
      this.el = document.createElement('div');
      this.el.className = 'actor' + (helper ? ' helper' : '');
      this.bubble = document.createElement('div');
      this.bubble.className = 'bubble';
      this.bubble.hidden = true;
      this.img = document.createElement('img');
      this.img.className = 'sprite';
      this.img.alt = tag || '';
      this.img.referrerPolicy = 'no-referrer';
      // Grow small sprites, but keep legendaries from swallowing the island.
      const [maxScale, maxHeight] = helper ? [1, 46] : [1.3, 72];
      this.img.onload = () => {
        const scale = Math.min(maxScale, maxHeight / this.img.naturalHeight);
        this.img.style.width = `${Math.round(this.img.naturalWidth * scale)}px`;
      };
      this.img.onerror = () => { this.img.onerror = null; this.img.src = still(dex); };
      this.img.src = animated(dex);
      const inner = document.createElement('div');
      inner.className = 'inner';
      inner.append(this.bubble, this.img);
      const shadow = document.createElement('div');
      shadow.className = 'shadow';
      this.tag = document.createElement('div');
      this.tag.className = 'tag';
      this.tag.textContent = tag || '';
      this.tag.hidden = !tag;
      this.el.append(shadow, inner, this.tag);
      stage.append(this.el);
      this.x = SPAWN.x;
      this.y = SPAWN.y;
      this.path = [];
      this.phase = Math.random() * 6;
      this.facingRight = false;
      this.onArrive = null;
      this.render();
    }

    say(state, detail, show) {
      const [icon, word] = BUBBLE[state] || ['', ''];
      this.bubble.textContent = icon ? `${icon} ${detail || word}` : '';
      this.bubble.title = this.bubble.textContent;
      this.bubble.hidden = !show || !icon;
      this.el.dataset.state = state;
    }

    place(spot) {
      this.x = spot.x;
      this.y = spot.y;
      this.path = [];
      this.render();
    }

    walkTo(spot, onArrive) {
      this.onArrive = onArrive || null;
      this.path = route(this, spot);
    }

    poof(out, done) {
      this.el.classList.add(out ? 'poof-out' : 'poof-in');
      setTimeout(() => {
        this.el.classList.remove('poof-in');
        if (done) done();
      }, 450);
    }

    tick(dt, t) {
      let budget = WALK_SPEED * dt;
      while (budget > 0 && this.path.length) {
        const p = this.path[0];
        const dx = p.x - this.x;
        const dy = p.y - this.y;
        const dist = Math.hypot(dx, dy);
        if (Math.abs(dx - dy) > 0.05) this.facingRight = dx - dy > 0; // sprites face left
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
      this.bob = walking ? Math.abs(Math.sin(t * 9 + this.phase)) * 3 : 0;
      this.render();
      if (!walking && this.onArrive) {
        const cb = this.onArrive;
        this.onArrive = null;
        cb();
      }
    }

    render() {
      const [sx, sy] = P(this.x, this.y);
      this.el.style.transform = `translate(${sx}px, ${sy}px)`;
      this.el.style.zIndex = depthZ(this.x + this.y) + 1;
      this.img.style.transform = `translateY(${-(this.bob || 0)}px) scaleX(${this.facingRight ? -1 : 1})`;
    }

    remove() {
      this.el.remove();
    }
  }

  // ---------- office ----------
  // `clock` lets a replay show "how long ago" in recording time instead of today's time.
  function createOffice(root, { feed, team, onStats, clock = Date.now } = {}) {
    root.classList.add('world');
    const stage = document.createElement('div');
    stage.className = 'stage';
    stage.style.width = `${W}px`;
    stage.style.height = `${H}px`;
    root.append(stage);
    const bg = document.createElement('canvas');
    bg.width = W;
    bg.height = H;
    bg.className = 'bg';
    stage.append(bg);
    const paintBase = () => {
      const ctx = bg.getContext('2d');
      ctx.clearRect(0, 0, W, H);
      paintGround(ctx);
      paintWalls(ctx);
    };
    paintBase();
    if (document.fonts) document.fonts.ready.then(paintBase);
    paintProps(stage);
    const nurse = new Actor(stage, { dex: 113, helper: true });
    nurse.place(NURSE);
    nurse.el.classList.add('nurse');

    function fit() {
      const top0 = root.clientHeight > 500 ? 40 : 0; // clear the top bar
      const avail = root.clientHeight - top0;
      const scale = Math.min(root.clientWidth / W, avail / H);
      const left = (root.clientWidth - W * scale) / 2;
      const top = top0 + (avail - H * scale) / 2;
      stage.style.transform = `translate(${left}px, ${top}px) scale(${scale})`;
    }
    new ResizeObserver(fit).observe(root);
    fit();

    const recs = new Map(); // id -> { data, actor, desk, slot, helpers, mode, wanderAt, goalKey }
    const fading = new Set();
    const now = () => performance.now();

    const freeIndex = (field, size) => {
      const used = new Set([...recs.values()].map((r) => r[field]));
      for (let i = 0; i < size; i++) if (!used.has(i)) return i;
      return null;
    };

    function roamSpot(rec) {
      const taken = new Set([...recs.values()].filter((r) => r !== rec).map((r) => r.goalKey));
      for (let i = 0; i < 20; i++) {
        const s = ROAM[Math.floor(Math.random() * ROAM.length)];
        const k = key(Math.floor(s.x), Math.floor(s.y));
        if (!taken.has(k)) {
          rec.goalKey = k;
          return s;
        }
      }
      return ROAM[0];
    }

    // Where a Pokémon belongs for its state: its desk, the centre's plaza, or out roaming.
    function decide(rec, instant) {
      const { state } = rec.data;
      let spot = null;
      let mode = 'roam';
      if (state === 'waiting') {
        if (rec.slot == null) rec.slot = freeIndex('slot', WAIT_SLOTS.length) ?? 0;
        spot = WAIT_SLOTS[rec.slot];
        mode = 'wait';
      } else {
        rec.slot = null;
        if (WORKING.has(state) && rec.desk != null) {
          spot = DESKS[rec.desk].spot;
          mode = 'desk';
        }
      }
      if (mode === 'roam') {
        if (rec.mode === 'roam' && !instant) return;
        spot = roamSpot(rec);
      } else {
        rec.goalKey = key(Math.floor(spot.x), Math.floor(spot.y));
      }
      rec.mode = mode;
      rec.wanderAt = Infinity;
      if (instant) {
        rec.actor.place(spot);
        rest(rec);
      } else rec.actor.walkTo(spot, () => rest(rec));
    }

    // Roaming Pokémon pause a few seconds wherever they arrive, then stroll on.
    function rest(rec) {
      rec.wanderAt = now() + 3000 + Math.random() * 6000;
    }

    function helperSpot(rec, i) {
      if (rec.desk == null) return { x: rec.actor.x + 0.8 + i * 0.6, y: rec.actor.y + 0.4 };
      const { c, r } = DESKS[rec.desk];
      return [{ x: c + 1.5, y: r - 0.5 }, { x: c + 2.5, y: r - 0.5 }, { x: c + 2.5, y: r + 0.5 }, { x: c + 2.5, y: r + 1.5 }][i % 4];
    }

    function syncHelpers(rec) {
      const live = rec.data.helpers || [];
      const ids = new Set(live.map((h) => h.id));
      for (const [id, actor] of rec.helpers) {
        if (ids.has(id)) continue;
        rec.helpers.delete(id);
        fading.add(actor);
        actor.poof(true, () => { actor.remove(); fading.delete(actor); });
      }
      live.forEach((h, i) => {
        let actor = rec.helpers.get(h.id);
        if (!actor) {
          actor = new Actor(stage, { dex: h.dex, tag: h.kind, helper: true });
          actor.place(helperSpot(rec, i));
          actor.poof(false);
          rec.helpers.set(h.id, actor);
        }
        actor.say(h.state, h.detail, true);
      });
    }

    function upsert(data, instant) {
      let rec = recs.get(data.id);
      if (!rec) {
        rec = { data, helpers: new Map(), slot: null, mode: null };
        rec.desk = freeIndex('desk', DESKS.length);
        recs.set(data.id, rec);
        rec.actor = new Actor(stage, { dex: data.dex, tag: data.project });
        if (!data.permanent && !instant) rec.actor.poof(false);
      }
      const prev = rec.data.state;
      rec.data = data;
      const freshDone = data.state === 'done' && prev !== 'done';
      rec.actor.say(data.state, data.detail, data.state !== 'done' || freshDone);
      if (freshDone) {
        clearTimeout(rec.doneTimer);
        rec.doneTimer = setTimeout(() => { rec.actor.bubble.hidden = true; }, 8000);
      }
      rec.actor.el.classList.toggle('offline', !data.live);
      decide(rec, instant);
      syncHelpers(rec);
    }

    function remove(id) {
      const rec = recs.get(id);
      if (!rec) return;
      recs.delete(id);
      for (const actor of [rec.actor, ...rec.helpers.values()]) {
        fading.add(actor);
        actor.poof(true, () => { actor.remove(); fading.delete(actor); });
      }
    }

    function clear() {
      for (const rec of recs.values()) for (const a of [rec.actor, ...rec.helpers.values()]) a.remove();
      for (const a of fading) a.remove();
      recs.clear();
      fading.clear();
      if (feed) feed.replaceChildren();
    }

    // ----- side panels -----
    const time = (t) => new Date(t).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' });
    function addFeed(item) {
      if (!feed) return;
      const li = document.createElement('li');
      li.dataset.state = item.state;
      const when = document.createElement('time');
      when.textContent = time(item.t);
      const who = document.createElement('b');
      who.textContent = item.name;
      const where = document.createElement('span');
      where.className = 'where';
      where.textContent = ` (${item.project}) `;
      const what = document.createElement('span');
      what.className = 'what';
      what.textContent = item.text;
      li.append(when, who, where, what);
      feed.prepend(li);
      while (feed.children.length > 60) feed.lastChild.remove();
    }

    const PILL = {
      waiting: 'Perlukan kau', thinking: 'Fikir', reading: 'Kerja', editing: 'Kerja', running: 'Kerja',
      web: 'Kerja', delegating: 'Kerja', done: 'Siap', idle: 'Standby',
    };
    const ORDER = (d) => (d.state === 'waiting' ? 0 : WORKING.has(d.state) ? 1 : d.live ? 2 : 3);
    function ago(t) {
      const s = Math.max(0, Math.round((clock() - (t || clock())) / 1000));
      return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}j`;
    }
    function task(d) {
      if (d.state === 'idle') return d.live ? 'Tunggu arahan' : 'Lepak-lepak';
      if (d.state === 'done') return 'Siap, tunggu arahan seterusnya';
      if (d.state === 'thinking') return d.detail || 'Tengah fikir';
      if (d.state === 'waiting') return d.detail || 'Perlukan kau';
      const [, word] = BUBBLE[d.state] || [];
      if (!d.detail) return word;
      return d.detail.startsWith('cari') ? d.detail : `${word} ${d.detail}`;
    }
    function renderTeam() {
      if (!team) return;
      const all = [...recs.values()].map((r) => r.data).sort((a, b) => ORDER(a) - ORDER(b));
      team.list.replaceChildren(...all.map((d) => {
        const li = document.createElement('li');
        li.dataset.state = d.state;
        li.classList.toggle('offline', !d.live);
        const icon = document.createElement('img');
        icon.src = still(d.dex);
        icon.alt = '';
        icon.referrerPolicy = 'no-referrer';
        const body = document.createElement('div');
        body.className = 'body';
        const head = document.createElement('div');
        head.className = 'row';
        const name = document.createElement('b');
        name.textContent = d.project;
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = d.label;
        const lv = document.createElement('span');
        lv.className = 'lv';
        lv.textContent = `Lv ${d.lv || 5}`;
        head.append(name, chip, lv);
        const sub = document.createElement('div');
        sub.className = 'row';
        const pill = document.createElement('span');
        pill.className = 'pill';
        pill.textContent = d.live ? PILL[d.state] || 'Kerja' : 'Rehat';
        const since = document.createElement('span');
        since.className = 'ago';
        since.textContent = ago(d.changedAt);
        sub.append(pill, since);
        const what = document.createElement('p');
        what.textContent = task(d);
        body.append(head, sub, what);
        li.append(icon, body);
        return li;
      }));
      const s = stats();
      team.summary.textContent = `${s.working} kerja · ${s.waiting} perlukan kau`;
    }
    setInterval(renderTeam, 5000);

    function stats() {
      const all = [...recs.values()].map((r) => r.data);
      return {
        total: all.length,
        live: all.filter((d) => d.live).length,
        waiting: all.filter((d) => d.state === 'waiting').length,
        working: all.filter((d) => WORKING.has(d.state)).length,
      };
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
        default: return;
      }
      renderTeam();
      if (onStats) onStats(stats());
    }

    let last = now();
    function frame(t) {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      const secs = t / 1000;
      for (const rec of recs.values()) {
        rec.actor.tick(dt, secs);
        for (const h of rec.helpers.values()) h.tick(dt, secs);
        if (rec.mode === 'roam' && !rec.actor.path.length && t > rec.wanderAt) {
          rec.wanderAt = Infinity;
          rec.actor.walkTo(roamSpot(rec), () => rest(rec));
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    return { apply, clear, stats };
  }

  window.PalletOffice = { createOffice };
})();
