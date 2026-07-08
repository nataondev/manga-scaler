# Development Guide

Panduan teknis buat yang mau kontribusi atau custom Manga Scaler.

## Arsitektur

```
📁 manga-scaler/
├── bin.ts                # Entry point CLI (serve | scrap | help)
├── index.ts              # Bun HTTP server + REST API
├── scrap.ts              # Hybrid: TUI (tanpa argumen) + CLI (dengan argumen)
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
├── tests/                # Unit tests
└── docs/                 # Dokumentasi teknis
```

## Alur Data

### Scraping Flow

```
User (TUI / CLI / API)
    → engine.scrape(url, count, startIndex, jobId, callback)
        → detectScraper(url)
        → scraper.getComicTitle(url)
        → resolveComic(...) // insert ke SQLite
        → scraper.listChapters(url)
        → for each chapter:
            → scraper.scrapeImages(url)
            → ImageProcessor.processImage(...) // download → upscale → webp
            → callback(job) // update progress
```

### Config Layering

```
1. ~/.config/manga-scaler/.env   ← global config (auto-generated)
2. ./.env                        ← override per project (cwd)
3. environment variable          ← override per session

Priority: 1 < 2 < 3 (semakin kanan semakin tinggi)
```

## REST API

Server jalan di `http://localhost:5000`.

### Scrap Endpoint

#### `POST /api/scrap`

Trigger scraping job.

**Body:**
```json
{
  "url": "https://komiku.org/manga/one-piece/",
  "startIndex": 0,
  "count": 3
}
```

**Response:** `202 Accepted`
```json
{ "jobId": "job-1700000000000-abc123" }
```

#### `GET /api/jobs`

List semua job.

```json
[
  {
    "id": "job-1700000000000-abc123",
    "status": "running",
    "title": "One Piece",
    "source": "komiku",
    "currentChapterLabel": "Chapter 3",
    "message": "Downloading 15/19..."
  }
]
```

#### `GET /api/jobs/:id`

Detail single job.

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

### Viewer Endpoint

| Endpoint | Keterangan |
|----------|------------|
| `GET /` | HTML viewer |
| `GET /api/komik` | List semua komik |
| `GET /api/komik/:judul` | List chapter |
| `GET /api/komik/:judul/:chapter` | List gambar |
| `GET /api/cover?judul=...` | Gambar cover |
| `GET /api/metadata?judul=...` | Metadata JSON |
| `GET /api/image?path=...` | Streaming gambar |

## SiteScraper Interface

```ts
import type { SiteScraper } from "../core";

export const myScraper: SiteScraper = {
  name: "mysite",                           // nama situs
  referer: "https://mysite.com/",           // referer header
  match(url) { return url.includes("mysite.com"); },
  async getComicTitle(url) { /* return string */ },
  async listChapters(url) { /* return ChapterEntry[] */ },
  async scrapeImages(chapterUrl) { /* return ImageData[] */ },
  parseChapter(url) { /* return string (chapter number) */ },
  // optional:
  async getMetadata(url) { /* return ComicMetadata */ },
};
```

Daftarkan di array `SCRAPERS` di `lib/engine.ts`:

```ts
import { myScraper } from "./sites/mysite";
const SCRAPERS = [komikuScraper, mangatownScraper, mangapillScraper, myScraper];
```

## Data Paths

| OS | Config | Data + Output | Cache |
|----|--------|---------------|-------|
| **Linux** | `~/.config/manga-scaler/` | `~/.local/share/manga-scaler/` | `~/.cache/manga-scaler/` |
| **macOS** | `~/Library/Application Support/manga-scaler/` | sama | `~/Library/Caches/manga-scaler/` |
| **Windows** | `%APPDATA%\manga-scaler\` | `%LOCALAPPDATA%\manga-scaler\` | cache di data + `\Cache\` |

## Config Reference

| Env | Default | Deskripsi |
|-----|---------|-----------|
| `WEB_SERVER_PORT` | `5000` | Port web server |
| `WAIFU2X_PATH` | `~/Repos/tools/waifu2x/waifu2x-ncnn-vulkan` | Path binary waifu2x |
| `MIN_IMAGE_WIDTH` | `900` | Threshold upscale (px) |
| `WEBP_QUALITY` | `85` | Quality WebP output (1-100) |
| `NOISE_REDUCTION` | `2` | waifu2x denoise (-1/0/1/2/3) |
| `SCALE_FACTOR` | `2` | waifu2x scale (1/2/4/8/16/32) |

## Testing

```bash
bun test
```

22 unit tests mencakup: paths, core utils, scraping engine, database CRUD.
