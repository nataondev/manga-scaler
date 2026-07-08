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

Manga Scaler adalah tools CLI buat download komik dari berbagai situs, auto perbesar gambar pake AI (waifu2x) biar tajem, terus dikonversi ke WebP biar ukurannya kecil. Ada web viewer buat baca hasil downloadannya langsung di browser.

## Fitur

- 🖥️ **TUI interaktif** — tinggal ketik `manga-scaler scrap`, pilih dari menu
- ⚡ **CLI mode** — `manga-scaler scrap <url> -c 5 -n 3` buat scripting
- 🧠 **AI Upscale** — gambar <900px diperbesar otomatis pake waifu2x
- 📖 **Web Viewer** — baca komik di browser, tinggal `manga-scaler serve`
- 💾 **Resume otomatis** — kalau mati tengah jalan, lanjut dari chapter terakhir
- 🌍 **Multi OS** — Linux, macOS, Windows, auto-deteksi folder config

## Install

### Requirement

- **[Bun](https://bun.sh)** `>=1.3`
- **[waifu2x-ncnn-vulkan](https://github.com/nihui/waifu2x-ncnn-vulkan/releases)** — download binary, taruh di PATH

### Install global

```bash
bun add -g github:nataondev/manga-scaler
```

Setelah itu command `manga-scaler` bisa dipake dari mana aja.

### Atau clone manual

```bash
git clone https://github.com/nataondev/manga-scaler
cd manga-scaler && bun install
```

Kalau clone manual, pakenya pake `bun bin.ts serve` / `bun bin.ts scrap`.

## Cara Pakai

### 1. Download komik

```bash
# Mode TUI (ada menunya)
manga-scaler scrap

# Atau langsung CLI
manga-scaler scrap https://komiku.org/manga/one-piece/
manga-scaler scrap https://komiku.org/manga/one-piece/ -c 5 -n 3   # mulai chapter 5, 3 chapter

# Cek history
manga-scaler scrap --history
```

### 2. Baca di browser

```bash
manga-scaler serve
```

Buka `http://localhost:5000` — udah ada grid cover, detail metadata, reader.

### 3. Setting config

Config otomatis dibuat pas pertama kali jalan. Tapi bisa diedit:

**Linux/macOS:** `~/.config/manga-scaler/.env`
**Windows:** `%APPDATA%\manga-scaler\.env`

```env
WEB_SERVER_PORT=5000
WAIFU2X_PATH=/usr/local/bin/waifu2x-ncnn-vulkan
MIN_IMAGE_WIDTH=900          # gambar di bawah ini di-upscale
WEBP_QUALITY=85
NOISE_REDUCTION=2
SCALE_FACTOR=2
```

Bisa juga override bikin `.env` di folder project yang lagi lo kerjain.

## Output di mana?

Hasil download disimpen otomatis:

| OS | Lokasi |
|----|--------|
| Linux | `~/.local/share/manga-scaler/komik/` |
| macOS | `~/Library/Application Support/manga-scaler/komik/` |
| Windows | `%LOCALAPPDATA%\manga-scaler\komik\` |

## Situs yang didukung

- komiku.org
- mangapill.com
- mangatown.com

Mau nambah situs lain? Bisa, liat [docs/development.md](docs/development.md).

## REST API

Server juga serve REST API. Detail lengkap di [docs/development.md](docs/development.md).

Cepetnya:

```bash
# Trigger scrap dari HTTP
curl -X POST http://localhost:5000/api/scrap \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://komiku.org/manga/one-piece/", "count": 3}'

# Cek status
curl http://localhost:5000/api/jobs
```

## Lisensi

MIT — © 2025 nataondev
