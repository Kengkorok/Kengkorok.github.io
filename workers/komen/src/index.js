// Komen "nama sahaja" untuk blog kengkorok.github.io.
// Komen baru masuk status 'menunggu' dan hanya dipapar selepas diluluskan di /admin.

const MAX_NAMA = 60;
const MAX_ISI = 2000;
const HAD_PER_IP = 3;          // komen setiap 10 minit bagi satu IP
const HAD_MENUNGGU = 300;      // had senarai menunggu, elak D1 dibanjiri
const MIN_MS = 3000;           // bot biasanya hantar terlalu cepat
const POST_RE = /^\/blog\/[a-z0-9][a-z0-9-]{0,120}\/$/;

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const cors = corsHeaders(req, env);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      if (url.pathname === '/komen' && req.method === 'GET') return await senarai(url, env, cors);
      if (url.pathname === '/komen' && req.method === 'POST') return await hantar(req, env, ctx, cors);
      if (url.pathname === '/admin' && req.method === 'GET') return adminPage();
      if (url.pathname.startsWith('/admin/api/')) return await adminApi(req, url, env);
      return json({ ralat: 'Tiada di sini.' }, 404, cors);
    } catch (err) {
      console.error(err);
      return json({ ralat: 'Ralat pelayan. Cuba lagi nanti.' }, 500, cors);
    }
  },
};

async function senarai(url, env, cors) {
  const post = url.searchParams.get('post') || '';
  if (!POST_RE.test(post)) return json({ ralat: 'Post tak sah.' }, 400, cors);
  const { results } = await env.DB.prepare(
    "SELECT nama, isi, dibuat FROM komen WHERE post = ? AND status = 'lulus' ORDER BY dibuat ASC LIMIT 500",
  ).bind(post).all();
  return json(results, 200, { ...cors, 'Cache-Control': 'public, max-age=60' });
}

async function hantar(req, env, ctx, cors) {
  if (!allowedOrigin(req, env)) return json({ ralat: 'Asal permintaan tak dibenarkan.' }, 403, cors);

  const body = await req.json().catch(() => null);
  if (!body) return json({ ralat: 'Data tak sah.' }, 400, cors);

  const post = String(body.post || '');
  const nama = clean(body.nama).slice(0, MAX_NAMA);
  const isi = clean(body.isi, true);

  // Perangkap bot: diam-diam terima supaya bot tak belajar
  if (body.laman || Number(body.ms) < MIN_MS) return json({ ok: true }, 202, cors);

  if (!POST_RE.test(post)) return json({ ralat: 'Post tak sah.' }, 400, cors);
  if (!nama || !isi) return json({ ralat: 'Isi nama dan komen dulu.' }, 400, cors);
  if (isi.length > MAX_ISI) return json({ ralat: `Komen terlalu panjang (had ${MAX_ISI} aksara).` }, 400, cors);

  if (env.TURNSTILE_SECRET && !(await turnstileOk(body.turnstile, req, env))) {
    return json({ ralat: 'Semakan anti-spam gagal. Muat semula halaman dan cuba lagi.' }, 400, cors);
  }

  const ip = req.headers.get('CF-Connecting-IP') || '';
  const ipHash = await sha256(`${ip}|${env.IP_SALT || 'komen'}`);
  const { n } = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM komen WHERE ip_hash = ? AND dibuat > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-10 minutes')",
  ).bind(ipHash).first();
  if (n >= HAD_PER_IP) return json({ ralat: 'Banyak sangat komen dalam masa singkat. Rehat kejap.' }, 429, cors);

  const { m } = await env.DB.prepare("SELECT COUNT(*) AS m FROM komen WHERE status = 'menunggu'").first();
  if (m >= HAD_MENUNGGU) return json({ ralat: 'Komen ditutup sementara. Cuba lagi nanti.' }, 503, cors);

  await env.DB.prepare('INSERT INTO komen (post, nama, isi, ip_hash) VALUES (?, ?, ?, ?)')
    .bind(post, nama, isi, ipHash).run();

  if (env.NOTIFY_WEBHOOK) ctx.waitUntil(notify(env, post, nama, isi, new URL(req.url).origin));
  return json({ ok: true }, 201, cors);
}

// ---------- Admin ----------

async function adminApi(req, url, env) {
  if (!(await isAdmin(req, env))) return json({ ralat: 'Token salah.' }, 401);

  const parts = url.pathname.split('/').filter(Boolean); // ['admin', 'api', ...]
  if (parts[2] === 'komen' && req.method === 'GET') {
    const status = url.searchParams.get('status') === 'lulus' ? 'lulus' : 'menunggu';
    const { results } = await env.DB.prepare(
      'SELECT id, post, nama, isi, status, dibuat FROM komen WHERE status = ? ORDER BY dibuat DESC LIMIT 200',
    ).bind(status).all();
    return json(results);
  }
  const id = Number(parts[3]);
  if (parts[2] === 'komen' && Number.isInteger(id)) {
    if (req.method === 'POST' && parts[4] === 'lulus') {
      await env.DB.prepare("UPDATE komen SET status = 'lulus' WHERE id = ?").bind(id).run();
      return json({ ok: true });
    }
    if (req.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM komen WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }
  }
  return json({ ralat: 'Tiada di sini.' }, 404);
}

async function isAdmin(req, env) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.ADMIN_TOKEN || !token) return false;
  const [a, b] = await Promise.all([sha256(token), sha256(env.ADMIN_TOKEN)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function adminPage() {
  return new Response(ADMIN_HTML, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
      'X-Robots-Tag': 'noindex',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

// ---------- Pembantu ----------

function clean(s, multiline = false) {
  let t = String(s ?? '').normalize('NFC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮]/g, '');
  t = multiline ? t.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n') : t.replace(/\s+/g, ' ');
  return t.trim();
}

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function allowedOrigin(req, env) {
  return allowedOrigins(env).includes(req.headers.get('Origin') || '');
}

function corsHeaders(req, env) {
  const origin = req.headers.get('Origin') || '';
  const h = { Vary: 'Origin' };
  if (allowedOrigins(env).includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function turnstileOk(token, req, env) {
  if (!token) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  form.append('remoteip', req.headers.get('CF-Connecting-IP') || '');
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const res = await r.json().catch(() => ({}));
  return res.success === true;
}

// Discord (atau mana-mana webhook yang terima {content})
async function notify(env, post, nama, isi, origin) {
  const ringkas = isi.length > 300 ? `${isi.slice(0, 300)}…` : isi;
  await fetch(env.NOTIFY_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: `💬 Komen baru menunggu di ${post}\n**${nama}**: ${ringkas}\nSemak: ${origin}/admin`,
      allowed_mentions: { parse: [] },
    }),
  }).catch(() => {});
}

const ADMIN_HTML = `<!doctype html>
<html lang="ms"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Komen · admin</title>
<style>
  :root { --bg:#E8E8E4; --ink:#1B1C1E; --muted:#6B6D70; --line:#CFCFCB; --accent:#2E5E4E; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px 16px 64px; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 760px; margin: 0 auto; }
  h1 { font-size: 28px; letter-spacing: -.03em; margin: 0 0 16px; }
  .bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 20px; }
  button, input { font: inherit; }
  button { padding: 8px 14px; border: 1px solid var(--ink); border-radius: 999px; background: none; color: var(--ink); cursor: pointer; }
  button[aria-pressed="true"], button.ink { background: var(--ink); color: var(--bg); }
  button.del { border-color: #A2412F; color: #A2412F; }
  input { width: 100%; padding: 10px 14px; border: 1px solid var(--line); border-radius: 12px; background: #fff; }
  form { display: grid; gap: 10px; max-width: 420px; }
  article { padding: 16px 0; border-top: 1px solid var(--line); }
  .meta { font: 12px/1.4 ui-monospace, monospace; color: var(--muted); }
  .isi { white-space: pre-line; overflow-wrap: anywhere; margin: 8px 0 12px; }
  .act { display: flex; gap: 8px; }
  .kosong { color: var(--muted); }
  [hidden] { display: none !important; }
</style></head>
<body><main>
  <h1>Komen blog</h1>
  <form id="login">
    <label for="tok">Token admin</label>
    <input id="tok" type="password" autocomplete="current-password" required>
    <button class="ink" type="submit">Masuk</button>
  </form>
  <section id="panel" hidden>
    <div class="bar">
      <button data-s="menunggu" aria-pressed="true">Menunggu</button>
      <button data-s="lulus" aria-pressed="false">Dah lulus</button>
      <button id="keluar" style="margin-left:auto">Keluar</button>
    </div>
    <div id="list"></div>
  </section>
</main>
<script>
const KEY = 'komen-admin-token';
let token = sessionStorage.getItem(KEY) || '';
let status = 'menunggu';
const $ = (s) => document.querySelector(s);
const api = (path, opt = {}) => fetch('/admin/api' + path, { ...opt, headers: { Authorization: 'Bearer ' + token } });

async function load() {
  const r = await api('/komen?status=' + status);
  if (r.status === 401) { sessionStorage.removeItem(KEY); token = ''; $('#panel').hidden = true; $('#login').hidden = false; return; }
  $('#login').hidden = true; $('#panel').hidden = false;
  const items = await r.json();
  const list = $('#list');
  list.replaceChildren();
  if (!items.length) { const p = document.createElement('p'); p.className = 'kosong'; p.textContent = 'Tiada komen.'; list.append(p); return; }
  for (const k of items) {
    const a = document.createElement('article');
    const meta = document.createElement('div'); meta.className = 'meta';
    meta.textContent = k.post + ' · ' + new Date(k.dibuat).toLocaleString('ms-MY');
    const who = document.createElement('strong'); who.textContent = k.nama;
    const isi = document.createElement('p'); isi.className = 'isi'; isi.textContent = k.isi;
    const act = document.createElement('div'); act.className = 'act';
    if (k.status === 'menunggu') {
      const ok = document.createElement('button'); ok.className = 'ink'; ok.textContent = 'Lulus';
      ok.onclick = async () => { await api('/komen/' + k.id + '/lulus', { method: 'POST' }); load(); };
      act.append(ok);
    }
    const del = document.createElement('button'); del.className = 'del'; del.textContent = 'Padam';
    del.onclick = async () => {
      if (del.dataset.pasti !== '1') { del.dataset.pasti = '1'; del.textContent = 'Pasti padam?'; return; }
      await api('/komen/' + k.id, { method: 'DELETE' }); load();
    };
    act.append(del);
    a.append(meta, who, isi, act);
    list.append(a);
  }
}
$('#login').onsubmit = (e) => { e.preventDefault(); token = $('#tok').value; sessionStorage.setItem(KEY, token); load(); };
$('#keluar').onclick = () => { sessionStorage.removeItem(KEY); location.reload(); };
document.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => {
  status = b.dataset.s;
  document.querySelectorAll('[data-s]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  load();
});
if (token) load();
</script>
</body></html>`;
