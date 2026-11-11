<p>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/svg/korokk-mendatar-gelap.svg">
    <img src="brand/svg/korokk-mendatar-cerah.svg" alt="korokk.com" width="240">
  </picture>
</p>

# korokk.com

Laman portfolio peribadi Mohd Safwan Abd Rahman (Korok): Bilal siang, builder malam.

**Live:** https://korokk.com/ (repo `Kengkorok.github.io`)

![Pratonton laman](assets/og.png)

## Isi kandungan

- **Lab**: slaid projek dengan video pratonton
  - Website Masjid Talhah (akan dilancarkan)
  - [Pallet Office](https://korokk.com/pallet-office/): session Claude Code sebagai Pokémon
  - [PoGo Wave Radar](https://korokk.com/pogo-wave-radar/)
  - [Jadual Kuliah Generator](https://github.com/Kengkorok/jadual-kuliah-generator)
  - [Servis Tracker](https://korokk.com/Auto-Services-Tracker/)
- **Kerjaya**: Masjid Talhah, Masjid Abdul Rahman Bin Auf, DevOps dan Homelab. Kursor jadi ikon korokk berpusing (tetikus sahaja)
- **Tulisan terkini**: post yang dipin (`pin: true`) di atas dengan label "Pilihan", kemudian post terbaru sehingga cukup 3
- **[Blog](https://korokk.com/blog/)**:
  - Senarai dengan post terbaru sebagai kad besar, ringkasan, thumbnail, tapis tag dan carian (`blog/search.json`)
  - Halaman post: senarai kandungan dari subtajuk (skrin lebar, minimum 3 subtajuk), klik gambar untuk zoom, kotak sumber, kotak penulis, butang kongsi (Salin pautan, WhatsApp, Threads), 3 tulisan berkaitan ikut tag dan komen
  - RSS (Atom) di [`/feed.xml`](https://korokk.com/feed.xml)
- **Hubungi**: GitHub, Threads, TikTok dan Ko-fi
- **Mod gelap**: suis matahari/bulan di nav laman utama dan blog. Ikut tetapan peranti selagi pelawat belum pilih sendiri, dan pilihan diingat (`localStorage`)

## Teknologi

HTML, CSS dan JavaScript biasa, tiada framework. GitHub Pages jalankan Jekyll untuk bahagian blog sahaja; laman lain disalin terus.

| Fail | Fungsi |
| --- | --- |
| `index.html` | Kandungan laman |
| `styles.css` | Gaya dan susun atur (desktop, tablet, telefon) |
| `main.js` | Suis tema, slaid Lab, video lazy-load, kad bertindan, kursor Kerjaya dan animasi |
| `assets/lab/` | Video pratonton (`.mp4` + versi `-mobile`) dan poster |
| `assets/career/` | Gambar untuk kad kerjaya |
| `pallet-office/` | Demo replay statik [Pallet Office](https://github.com/Kengkorok/pallet-office) |
| `_posts/` | Tulisan blog (`.md` atau `.html`) |
| `_layouts/`, `_includes/` | Templat Jekyll untuk blog |
| `blog/`, `blog.css`, `blog.js` | Senarai tulisan, carian, tag dan komen |
| `brand/` | Logo, ikon dan [panduan jenama](https://korokk.com/brand/panduan.html) |
| `_data/penulis.yml` | Penulis selain Safwan (Claudrok, korokGPT): nama, lencana AI dan model |
| `_data/authors.yml` | Nama penulis yang sama untuk RSS (jekyll-feed) |
| `_data/bulan.yml` | Nama bulan BM untuk tarikh post |
| `blog/search.json` | Indeks carian untuk `/blog/` |
| `llms.txt` | Ringkasan laman untuk model AI ([llmstxt.org](https://llmstxt.org)), senarai post dijana sendiri |
| `robots.txt` | Benarkan semua, dan tunjuk sitemap laman dan PoGo Wave Radar |
| `404.html` | Halaman tak dijumpai |
| `privasi/`, `terma/` | Polisi privasi dan terma perkhidmatan (Inggeris) Korokk Studio, untuk pendaftaran app TikTok |
| `tiktok*.txt` | Fail pengesahan domain dan sandbox TikTok. Jangan padam |
| `favicon.*`, `icon-*.png`, `apple-touch-icon.png`, `site.webmanifest` | Favicon dan ikon app (salinan dari `brand/web/`) |
| `CNAME` | Domain `korokk.com` untuk GitHub Pages |
| `workers/komen/` | Cloudflare Worker untuk komen tanpa akaun ([panduan](workers/komen/README.md)) |

## Jalankan secara local

Laman utama dan blog perlu Jekyll. Cara paling mudah guna imej Docker yang sama dengan GitHub Pages:

```bash
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD":/github/workspace/src -v "$PWD/_site":/github/workspace/out -e GITHUB_WORKSPACE=/github/workspace -e INPUT_SOURCE=src -e INPUT_DESTINATION=out -e GITHUB_REPOSITORY=Kengkorok/Kengkorok.github.io -e INPUT_TOKEN="$(gh auth token)" ghcr.io/actions/jekyll-build-pages:v1.0.13
python3 -m http.server 4000 -d _site
```

Kemudian buka http://localhost:4000.

## Tulis post blog

Cara utama: [Studio](https://github.com/Kengkorok/studio) di `studio.korokk.com`. Tulis dalam browser, tekan **Terbit**, dan Studio commit post, gambar dan thumbnail ke repo ni.

Cara manual:

1. Salin [`_drafts/templat.md`](_drafts/templat.md) ke `_posts/2026-11-03-tajuk-pendek.md`. Nama fail jadi URL: `/blog/tajuk-pendek/`.
2. Isi `title`, `description` dan `tags`. Letak gambar dalam `assets/blog/2026/tajuk-pendek/`.
3. Commit dan push. GitHub Pages siarkan dalam ~1 minit.

Nota:
- Post bertarikh masa depan tak keluar sehingga ada push lain selepas tarikh tu.
- `image` jadi cover dan imej pratonton bila link dikongsi. Tanpa `image`, guna `assets/og.png`.
- Garis bawah guna `<u>teks</u>`. HTML biasa boleh dicampur dalam Markdown.

### Front matter

| Medan | Guna |
| --- | --- |
| `title` | Tajuk post |
| `description` | Ringkasan: bawah tajuk, dalam senarai, dan pratonton link |
| `tags` | Senarai tag |
| `image` | Cover dan imej OG |
| `thumb` | Thumbnail 480px untuk senarai (Studio jana masa terbit). Tanpanya, senarai guna `image` |
| `image_alt`, `image_credit` | Teks alt dan kredit cover |
| `cover: false` | Imej OG sahaja, tak papar cover atas post |
| `komen: false` | Tutup komen |
| `pin: true` | Pin di atas "Tulisan terkini" laman utama. Kalau lebih dari satu, yang terbaru dipakai |
| `author` | Kunci dari `_data/penulis.yml` (`claudrok`, `korokgpt`). Kosong = Safwan |
| `sumber` | Senarai `{ title, url }`, keluar sebagai kotak "Sumber" di hujung post |
| `noindex: true` | Meta noindex (biasanya diset melalui `defaults` dalam `_config.yml`, sekali dengan `sitemap: false`) |

## Statistik pelawat

`main.js` hantar satu rekod setiap halaman dibuka ke `/hit` pada Worker komen (jadual `lawatan` dalam D1), dan Studio paparkan dalam tab Statistik. Lawatan sendiri tak dikira: Studio set cookie `korok_abai` pada `.korokk.com`, atau buka `korokk.com/?abai=1` sekali dari peranti lain (`?abai=0` untuk batal).

## Komen

Setiap post ada dua tab:
- **Nama sahaja**: melalui [`workers/komen`](workers/komen/README.md), disemak dulu sebelum dipapar. Tab ni tersorok selagi `komen.api` dalam `_config.yml` kosong.
- **Guna GitHub**: [giscus](https://giscus.app). Komen disimpan dalam Discussions repo ni (kategori Announcements). Perlu app [giscus](https://github.com/apps/giscus) dipasang pada repo.

## Tambah projek baru

1. Rakam video demo, kemudian tukar ke MP4:
   ```bash
   ffmpeg -i demo.webm -an -vf "scale=1280:-2" -c:v libx264 -crf 26 -pix_fmt yuv420p -movflags +faststart assets/lab/nama.mp4
   ffmpeg -i demo.webm -an -vf "scale=640:-2" -c:v libx264 -crf 28 -pix_fmt yuv420p -movflags +faststart assets/lab/nama-mobile.mp4
   ffmpeg -ss 1 -i demo.webm -frames:v 1 -vf "scale=1280:-2" assets/lab/nama-poster.jpg
   ```
2. Salin satu `<li class="lab__slide">` dalam `index.html`, tukar video, teks dan pautan.
3. Kemas kini kaunter `01 / 05` dalam `.lab__count`.

## Jenama

Warna utama: terakota `#9E4A2F`, krim `#F1EBE0`, dakwat `#2B211A`.

| | Mod cerah | Mod gelap |
| --- | --- | --- |
| Logo nav | [`korokk-mendatar-cerah.svg`](brand/svg/korokk-mendatar-cerah.svg): kotak terakota, simbol krim, tulisan dakwat | [`korokk-mendatar-gelap.svg`](brand/svg/korokk-mendatar-gelap.svg): kotak krim, simbol terakota, tulisan krim |
| Ikon app | [`ikon-app.svg`](brand/web/ikon-app.svg), [`korokk-ikon-app-1024.png`](brand/png/korokk-ikon-app-1024.png) | Warna sama dengan logo gelap (dipakai pada kursor Kerjaya) |

<p>
  <img src="brand/png/korokk-ikon-app-1024.png" alt="Ikon app korokk" width="96">
</p>

Fail lain (warna, hitam, putih, terbalik, bertindan, wordmark) ada dalam [`brand/svg/`](brand/svg/) dan [`brand/png/`](brand/png/). Favicon dan manifest dalam [`brand/web/`](brand/web/).

## Kredit

- Font: [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque), [Host Grotesk](https://fonts.google.com/specimen/Host+Grotesk) dan [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) (Google Fonts, OFL)
- Ikon sosial: [Simple Icons](https://simpleicons.org/) (CC0)

© 2026 Mohd Safwan Abd Rahman
