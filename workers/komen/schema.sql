CREATE TABLE IF NOT EXISTS komen (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  post    TEXT NOT NULL,                       -- contoh: /blog/tajuk-post/
  nama    TEXT NOT NULL,
  isi     TEXT NOT NULL,
  status  TEXT NOT NULL DEFAULT 'menunggu',    -- menunggu | lulus
  ip_hash TEXT,
  dibuat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS komen_post ON komen (post, status, dibuat);
CREATE INDEX IF NOT EXISTS komen_ip   ON komen (ip_hash, dibuat);

-- Statistik lawatan: satu baris setiap halaman dibuka (pemilik tak dikira, lihat main.js)
CREATE TABLE IF NOT EXISTS lawatan (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  path    TEXT NOT NULL,                       -- contoh: /blog/tajuk-post/
  pelawat TEXT NOT NULL,                       -- ID rawak dari localStorage pelawat
  dibuat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS lawatan_dibuat ON lawatan (dibuat, pelawat);
CREATE INDEX IF NOT EXISTS lawatan_path   ON lawatan (path, dibuat);
