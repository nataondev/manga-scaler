# Manga Scaler

Tools untuk scraping komik dari berbagai situs, auto upscale gambar dengan **waifu2x-ncnn-vulkan** (AI), lalu kompresi ke **WebP** via sharp. Dilengkapi web viewer untuk membaca komik yang sudah diunduh.

## Fitur

- **Multi-source**: komiku.org, mangapill.com, mangatown.com (mudah tambah situs baru via plugin)
- **AI Upscale**: waifu2x-ncnn-vulkan untuk gambar <900px width
- **WebP Compression**: sharp WebP quality 85%, file jauh lebih kecil
- **Web Viewer**: baca komik langsung di browser
- **SQLite**: tracking download, resume support, history
- **Pagination Chapter Browser**: list chapter per 10 dengan navigasi

## Persiapan

### 1. Requirements
- **[Bun](https://bun.sh)** runtime
- **[waifu2x-ncnn-vulkan](https://github.com/nihui/waifu2x-ncnn-vulkan/releases)** — download binary sesuai OS

### 2. Install
```bash
./install.sh
# atau manual:
bun install
cp env.example .env
```

### 3. Konfigurasi `.env`
```env
WEB_SERVER_PORT=5000
WAIFU2X_PATH=~/Repos/tools/waifu2x/waifu2x-ncnn-vulkan
MIN_IMAGE_WIDTH=900      # <= threshold untuk upscale
WEBP_QUALITY=85           # quality WebP output
NOISE_REDUCTION=2         # waifu2x noise reduction
SCALE_FACTOR=2            # waifu2x scale factor
```

## Struktur
```
📁 manga-scaler/
├── scrap.ts              # Entry point scraping
├── index.ts              # Web viewer server
├── lib/
│   ├── core.ts           # Config, utils, ImageProcessor
│   ├── db.ts             # SQLite schema + CRUD
│   └── sites/
│       ├── komiku.ts     # Scraper komiku.org
│       ├── mangapill.ts  # Scraper mangapill.com
│       └── mangatown.ts  # Scraper mangatown.com
├── public/               # Web viewer frontend
├── data/                 # SQLite database
└── komik/                # Output folder gambar
```

## Penggunaan

### Scraping
```bash
bun scrap
```
Pilih history atau paste URL. Sistem auto-detect situs dari URL.

### Web Viewer
```bash
bun serve
# atau
bun .
```
Buka `http://localhost:5000`

## Menambah Situs Baru

Buat file di `lib/sites/`, implement interface `SiteScraper`:
```ts
export const myScraper: SiteScraper = {
  name: "mysite",
  referer: "https://mysite.com/",
  match(url) { return url.includes("mysite.com"); },
  async getComicTitle(url) { ... },
  async listChapters(url) { ... },
  async scrapeImages(url) { ... },
  parseChapter(url) { ... },
};
```
Daftarkan di array `SCRAPERS` di `scrap.ts`.

## Lisensi
MIT
