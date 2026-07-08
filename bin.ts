#!/usr/bin/env bun

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const args = process.argv.slice(2);
const cmd = args[0];

function showHelp() {
  console.log(`manga-scaler — Komik scraper + upscale + web viewer

Usage:
  manga-scaler serve            Jalankan web viewer + API server
  manga-scaler scrap [url]      Scrape komik (CLI mode)
  manga-scaler help             Tampilkan bantuan

Contoh:
  manga-scaler serve
  manga-scaler scrap https://komiku.org/manga/one-piece/
  manga-scaler scrap https://komiku.org/manga/one-piece/ -c 5 -n 3

Scrap Options:
  --chapter, -c <n>   Mulai dari chapter ke-n (1-based, default: 1)
  --count, -n <n>     Jumlah chapter (default: semua)
  --history, -ls      Lihat history download
`);
}

if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
  showHelp();
  process.exit(0);
}

if (cmd === "serve") {
  await import("./index.ts");
} else if (cmd === "scrap") {
  process.argv = ["bun", "scrap.ts", ...args.slice(1)];
  await import("./scrap.ts");
} else {
  console.error(`Unknown command: ${cmd}`);
  showHelp();
  process.exit(1);
}
