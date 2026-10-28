# Worker komen

Komen "nama sahaja" untuk blog. Cloudflare Worker + D1, percuma dalam had Cloudflare.

- `GET /komen?post=/blog/slug/`: senarai komen yang dah lulus
- `POST /komen`: hantar komen baru (masuk status `menunggu`)
- `/admin`: panel lulus/padam komen (perlu `ADMIN_TOKEN`)

Perlindungan spam: medan perangkap tersorok, had masa minimum 3 saat, 3 komen per IP setiap 10 minit (IP disimpan sebagai hash), had 300 komen menunggu, dan Turnstile (pilihan).

## Deploy kali pertama

```bash
cd workers/komen
npm install
npx wrangler login
npx wrangler d1 create komen          # salin database_id ke wrangler.toml
npm run db:init                       # cipta jadual
npx wrangler secret put ADMIN_TOKEN   # taip token panjang, simpan dalam password manager
npx wrangler secret put IP_SALT       # apa-apa teks rawak
npm run deploy
```

Selepas deploy, wrangler tunjuk URL macam `https://komen.<akaun>.workers.dev`. Masukkan URL tu dalam `_config.yml` portfolio:

```yaml
komen:
  api: "https://komen.<akaun>.workers.dev"
```

Push portfolio, dan tab "Nama sahaja" muncul di setiap post.

**Domain sendiri (pilihan):** buka komen pada baris `routes` dalam `wrangler.toml` (contoh `komen.korokk.com`), deploy semula, dan tukar `api` dalam `_config.yml`.

## Semak komen

Buka `<url-worker>/admin`, masukkan `ADMIN_TOKEN`, kemudian tekan **Lulus** atau **Padam**. Komen yang lulus keluar di blog dalam masa ~1 minit.

## Pilihan tambahan

| Rahsia | Guna |
| --- | --- |
| `NOTIFY_WEBHOOK` | URL webhook Discord. Dapat mesej setiap kali ada komen baru menunggu |
| `TURNSTILE_SECRET` | Hidupkan captcha senyap Cloudflare Turnstile. Isi juga `turnstile_sitekey` dalam `_config.yml` |

Tambah dengan `npx wrangler secret put NAMA`, kemudian `npm run deploy`.

## Uji local

```bash
npx wrangler d1 execute komen --local --file schema.sql
echo 'ADMIN_TOKEN=ujian' > .dev.vars
npm run dev    # http://127.0.0.1:8787
```

Dalam `_config.yml`, set sementara `api: "http://127.0.0.1:8787"` dan buka blog di `http://localhost:4000`.
