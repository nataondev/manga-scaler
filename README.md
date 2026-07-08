<h1 align="center">📚 Manga Scaler</h1>
<p align="center">
  <img src="https://img.shields.io/badge/runtime-bun-f9f1e1?logo=bun" alt="Bun">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License">
  <img src="https://img.shields.io/badge/platform-linux%20|%20macos%20|%20windows-lightgrey" alt="Platform">
</p>
<p align="center">
  Download komik, upscale pake AI, baca di browser.<br>Satu command. Semua otomatis.
</p>

---

## Apa ini?

Manga Scaler adalah tools CLI buat download komik dari berbagai situs, auto perbesar gambar pake AI (waifu2x), terus dikonversi ke WebP. Ada web viewer Svelte + Tailwind buat baca dan manage hasil download-an langsung di browser.

## Fitur

- 🖥️ **TUI interaktif** — `manga-scaler scrap`, pilih dari menu
- ⚡ **CLI mode** — `manga-scaler scrap <url> -c 5 -n 3`
- 🧠 **AI Upscale** — gambar ≤950px diperbesar otomatis pake waifu2x-ncnn-vulkan
- 📖 **Web Viewer (Svelte)** — grid manga, detail metadata, reader dengan tap zone
- 📋 **Chapter Manager** — lihat semua chapter, download/hapus per chapter, progress bar live
- 🔄 **Job tracking** — SSE real-time progress + cancel job
- 💾 **Resume otomatis** — lanjut dari chapter terakhir
- 🌍 **Multi OS** — Linux, macOS, Windows

## Install

### 1-command install

```bash
./install.sh
```

Ini nge-handle semuanya:
- Install Bun (kalo belum ada)
- Auto-download waifu2x-ncnn-vulkan sesuai OS (dari GitHub releases)
- Install dependensi backend
- Build frontend Svelte
- Buat `.env` otomatis

### Atau install manual

```bash
git clone https://github.com/nataondev/manga-scaler
cd manga-scaler
bun install
cd frontend && bun install && bun run build && cd ..
```

### Install global (dari repo)

```bash
bun add -g github:nataondev/manga-scaler
```

Command `manga-scaler` bisa dipake dari mana aja.

## Cara Pakai

### 1. Download komik

```bash
# Mode TUI
manga-scaler scrap

# CLI langsung
manga-scaler scrap https://komiku.org/manga/one-piece/
manga-scaler scrap https://komiku.org/manga/one-piece/ -c 5 -n 3

# Cek history
manga-scaler scrap --history
```

### 2. Baca di browser

```bash
manga-scaler serve     # atau: bun serve
```

Buka `http://localhost:5000`.

**Reader:**
- **Grid** — cover manga, search judul
- **Detail** — metadata lengkap + list chapter. Klik "Kelola Chapter" buat buka modal download manager.
- **Reader** — tap zone untuk navigasi: atas scroll up 500px, tengah toggle header/footer, bawah scroll down 500px. Keyboard: ← → buat ganti chapter.

**Job tab:** progress bar live, cancel job. Bisa scrape langsung dari sini — paste URL.

### 3. Manage chapter dari UI

Klik "Kelola Chapter" di detail page → modal popup:
- List semua chapter dari remote (✓ = downloaded, abu-abu = belum)
- Download per chapter + progress bar real-time
- Hapus chapter yang udah didownload
- "Download semua baru" buat download chapter yang belum ada

### 4. Config

Config di `~/.config/manga-scaler/.env` (Linux) atau `%APPDATA%\manga-scaler\.env` (Windows):

```env
WEB_SERVER_PORT=5000
WAIFU2X_PATH=~/Repos/tools/waifu2x/waifu2x-ncnn-vulkan
MIN_IMAGE_WIDTH=950          # gambar ≤950px di-upscale, >950px skip
WEBP_QUALITY=85
NOISE_REDUCTION=2
SCALE_FACTOR=2
```

Override: bikin `.env` di folder project yang sedang dipakai.

## Output

| OS | Lokasi |
|----|--------|
| Linux | `~/.local/share/manga-scaler/komik/` |
| macOS | `~/Library/Application Support/manga-scaler/komik/` |
| Windows | `%LOCALAPPDATA%\manga-scaler\komik\` |

## Situs didukung

- komiku.org
- mangapill.com
- mangatown.com

Nambah situs? Cek [docs/development.md](docs/development.md).

## REST API

```bash
# Trigger scrap
curl -X POST localhost:5000/api/scrap \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://komiku.org/manga/one-piece/", "count": 3}'

# Cek status job
curl localhost:5000/api/jobs

# Check update (detect chapter baru)
curl -X POST localhost:5000/api/scrap/check \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://..."}'

# SSE job events
curl localhost:5000/api/jobs/events

# Cancel job
curl -X POST localhost:5000/api/jobs/<id>/cancel
```

Detail lengkap di [docs/development.md](docs/development.md).

## Development

```bash
# Backend
bun serve

# Frontend dev (hot reload)
cd frontend && bun run dev

# Test
bun test
```

## Lisensi

MIT — © 2025 nataondev
