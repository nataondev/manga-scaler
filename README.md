<h1 align="center">📚 Manga Scaler</h1>
<p align="center">
  <img src="https://img.shields.io/badge/runtime-bun-f9f1e1?logo=bun" alt="Bun">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License">
  <img src="https://img.shields.io/badge/platform-linux%20|%20macos%20|%20windows-lightgrey" alt="Platform">
</p>
<p align="center">
  Scraping komik multi-source, upscale AI, konversi WebP, web viewer, dan REST API —<br>dalam satu CLI tool yang bisa diinstall global.
</p>

---

## Daftar Isi

- [Fitur](#fitur)
- [Requirements](#requirements)
- [Install](#install)
- [Konfigurasi](#konfigurasi)
- [Penggunaan](#penggunaan)
  - [CLI](#cli)
  - [REST API](#rest-api)
  - [Web Viewer](#web-viewer)
- [Arsitektur](#arsitektur)
- [Data Paths](#data-paths)
- [Menambah Situs Baru](#menambah-situs-baru)
- [Testing](#testing)
- [Lisensi](#lisensi)

## Fitur

| | |
|--|--|
| 🔌 **Multi-source** | komiku.org • mangapill.com • mangatown.com (plugin-based, gampang tambah) |
| 🧠 **AI Upscale** | waifu2x-ncnn-vulkan untuk gambar <900px width — output langsung WebP, tanpa intermediate PNG |
| 📖 **Web Viewer** | baca komik langsung di browser, grid cover + chapter navigator + reader infinite scroll |
| 🔧 **REST API** | trigger scrap via HTTP, cek status job real-time, integrasi ke frontend/manapun |
| 💾 **SQLite DB** | tracking download per gambar, resume otomatis, history, statistik ukuran file |
| 🖥️ **Cross-platform** | Linux (XDG), macOS (Library), Windows (AppData) — auto-detect path |
| ⚡ **CLI** | scrape non-interaktif dari terminal: `manga-scaler scrap <url> -c 1 -n 5` |
| 🎯 **Config layering** | global config → cwd `.env` → environment variable |

## Requirements

- **[Bun](https://bun.sh)** `>=1.3`
- **[waifu2x-ncnn-vulkan](https://github.com/nihui/waifu2x-ncnn-vulkan/releases)** — download binary sesuai OS, taruh di PATH atau set `WAIFU2X_PATH`

## Install

```bash
# Global (direkomendasikan)
bun add -g github:nataondev/manga-scaler

# Atau clone + link manual
git clone https://github.com/nataondev/manga-scaler
cd manga-scaler && bun install && bun link
```

Setelah install, command `manga-scaler` tersedia dari mana saja.

## Konfigurasi

Config file **otomatis dibuat** saat pertama kali jalan. Priority load:

```
1. ~/.config/manga-scaler/.env   ← global config (auto-generated)
2. ./.env                        ← override per project
3. environment variable          ← override per session
```

```env
# ~/.config/manga-scaler/.env
WEB_SERVER_PORT=5000
WAIFU2X_PATH=/usr/local/bin/waifu2x-ncnn-vulkan
MIN_IMAGE_WIDTH=900          # threshold upscale (px)
WEBP_QUALITY=85              # quality WebP output
NOISE_REDUCTION=2            # -1/0/1/2/3
SCALE_FACTOR=2               # 1/2/4/8/16/32
```

## Penggunaan

### CLI

```bash
# Jalankan server + web viewer
manga-scaler serve

# Scrape dari chapter awal, semua chapter
manga-scaler scrap https://komiku.org/manga/one-piece/

# Mulai dari chapter 5, download 3 chapter
manga-scaler scrap https://komiku.org/manga/one-piece/ -c 5 -n 3

# Lihat history download
manga-scaler scrap --history

# Bantuan
manga-scaler help
```

Output CLI:

```
Mulai scrape: https://komiku.org/manga/one-piece/
Tekan Ctrl+C untuk berhenti.

[One Piece] Ch 3/1100 - Downloading 15/19...
```

### REST API

Server berjalan di `http://localhost:5000`.

#### Trigger Scrap

```bash
curl -X POST http://localhost:5000/api/scrap \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://komiku.org/manga/one-piece/",
    "startIndex": 0,
    "count": 3
  }'
```

Response: `202 Accepted`

```json
{ "jobId": "job-1700000000000-abc123" }
```

#### Cek Status Job

```bash
# Semua job
curl http://localhost:5000/api/jobs

# Job spesifik
curl http://localhost:5000/api/jobs/job-1700000000000-abc123
```

Response:

```json
{
  "id": "job-1700000000000-abc123",
  "url": "https://komiku.org/manga/one-piece/",
  "status": "running",
  "title": "One Piece",
  "source": "komiku",
  "totalChapters": 1100,
  "currentChapterIndex": 2,
  "currentChapterLabel": "Chapter 3",
  "currentImageIndex": 14,
  "totalImagesInChapter": 19,
  "okImages": 47,
  "failedImages": 1,
  "message": "Downloading 15/19..."
}
```

Status: `preparing` → `running` → `done` | `failed`

#### Endpoint Web Viewer

| Endpoint | Keterangan |
|----------|------------|
| `GET /` | HTML viewer |
| `GET /api/komik` | List semua komik |
| `GET /api/komik/:judul` | List chapter |
| `GET /api/komik/:judul/:chapter` | List gambar |
| `GET /api/cover?judul=...` | Gambar cover |
| `GET /api/metadata?judul=...` | Metadata JSON |
| `GET /api/image?path=...` | Streaming gambar |

### Web Viewer

Buka `http://localhost:5000` — grid cover, detail metadata, reader dengan navigasi chapter.

## Arsitektur

```
📁 manga-scaler/
├── bin.ts                # Entry point CLI (serve | scrap | help)
├── index.ts              # Bun HTTP server + REST API
├── scrap.ts              # CLI scraping (pakai engine)
├── lib/
│   ├── core.ts           # Config loader, ImageProcessor, utils
│   ├── db.ts             # SQLite schema + CRUD
│   ├── engine.ts         # Scraping engine (reusable)
│   ├── paths.ts          # Cross-platform path resolver
│   └── sites/
│       ├── komiku.ts     # Scraper komiku.org
│       ├── mangapill.ts  # Scraper mangapill.com
│       └── mangatown.ts  # Scraper mangatown.com
├── public/               # Web viewer (vanilla HTML/JS/CSS)
└── tests/                # Unit tests
```

## Data Paths

| OS | Config | Data + Output | Cache |
|----|--------|---------------|-------|
| **Linux** | `~/.config/manga-scaler/` | `~/.local/share/manga-scaler/` | `~/.cache/manga-scaler/` |
| **macOS** | `~/Library/Application Support/manga-scaler/` | sama | `~/Library/Caches/manga-scaler/` |
| **Windows** | `%APPDATA%\manga-scaler\` | `%LOCALAPPDATA%\manga-scaler\` | cache di data + `\Cache\` |

Output komik di: `{data}/komik/{slug}/{chapter}/`

## Menambah Situs Baru

Buat file di `lib/sites/`, implement interface `SiteScraper`:

```ts
import type { SiteScraper } from "../core";

export const myScraper: SiteScraper = {
  name: "mysite",
  referer: "https://mysite.com/",
  match(url) { return url.includes("mysite.com"); },
  async getComicTitle(url) { /* return string */ },
  async listChapters(url) { /* return ChapterEntry[] */ },
  async scrapeImages(chapterUrl) { /* return ImageData[] */ },
  parseChapter(url) { /* return string */ },
  // optional:
  async getMetadata(url) { /* return ComicMetadata */ },
};
```

Daftarkan di array `SCRAPERS` di `lib/engine.ts`:

```ts
import { myScraper } from "./sites/mysite";
const SCRAPERS = [komikuScraper, mangatownScraper, mangapillScraper, myScraper];
```

## Testing

```bash
bun test
```

```
tests/basic.test.ts:
✓ paths > config dir sesuai OS
✓ paths > data dir sesuai OS
✓ paths > cache dir sesuai OS
✓ core > slugify normal
✓ core > slugify edge cases
✓ core > CONFIG punya semua key
✓ core > CONFIG OUTPUT_DIR absolute path
✓ core > utils.ensureFolderExists bikin folder
✓ core > utils.getImageSavePath
✓ core > utils.retry retries on failure
✓ core > utils.retry fails after max retries
✓ core > resolveComic
✓ engine > listScrapers returns all
✓ engine > detectScraper komiku
✓ engine > detectScraper mangatown
✓ engine > detectScraper mangapill
✓ engine > detectScraper unknown returns null
✓ db > getDb returns instance
✓ db > upsertComic insert lalu update
✓ db > getComicHistory returns entries
✓ db > upsertChapter dan isChapterComplete
✓ db > getDownloadedChapters

22 pass · 0 fail
```

## Lisensi

MIT — © 2025 nataondev
