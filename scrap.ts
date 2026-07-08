#!/usr/bin/env bun

import {
  detectScraper,
  scrape,
  type ScrapeJob,
  getComicHistory,
  getDownloadedChapters,
} from "./lib/engine";
import {
  resolveComic,
  resolveChapter,
  isChapterAlreadyDone,
  finishChapter,
  saveMetadata,
  ImageProcessor,
  type ChapterEntry,
} from "./lib/core";

const args = process.argv.slice(2);

// === CLI MODE ===
const hasArgs = args.some(a => a.startsWith("-") || a.includes("://"));

if (hasArgs) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`Usage: manga-scaler scrap [options] [url]

Options:
  --chapter, -c <n>   Mulai dari chapter ke-n (1-based, default: 1)
  --count, -n <n>     Jumlah chapter (default: semua)
  --url, -u <url>     URL komik (bisa langsung tanpa flag)
  --history, -ls      Lihat history download
  --help, -h          Tampilkan bantuan

Contoh:
  manga-scaler scrap https://komiku.org/manga/one-piece/
  manga-scaler scrap https://komiku.org/manga/one-piece/ -c 5 -n 3
  manga-scaler scrap --history
`);
    process.exit(0);
  }

  if (args.includes("--history") || args.includes("-ls")) {
    const hist = getComicHistory(10) as any[];
    if (!hist.length) {
      console.log("Belum ada history download.");
    } else {
      console.log("History (10 terakhir):");
      hist.forEach((h: any, i: number) => {
        console.log(`  ${i + 1}. ${h.title}  [${h.source}]  ${h.url}`);
      });
    }
    process.exit(0);
  }

  let url = "";
  let chapterIdx = 0;
  let count = Infinity;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-c" || args[i] === "--chapter") {
      chapterIdx = (parseInt(args[++i]) || 1) - 1;
    } else if (args[i] === "-n" || args[i] === "--count") {
      count = parseInt(args[++i]) || Infinity;
    } else if (args[i] === "-u" || args[i] === "--url") {
      url = args[++i] || "";
    } else if (!args[i].startsWith("-")) {
      url = args[i];
    }
  }

  if (!url) {
    console.error("Error: URL harus diisi.\nGunakan --help untuk bantuan.");
    process.exit(1);
  }

  const scraper = detectScraper(url);
  if (!scraper) {
    console.error(`Error: Tidak ada scraper untuk ${new URL(url).hostname}`);
    process.exit(1);
  }

  const jobId = `cli-${Date.now()}`;

  console.log(`Mulai scrape: ${url}`);
  console.log("Tekan Ctrl+C untuk berhenti.\n");

  const onChange = (job: ScrapeJob) => {
    if (job.status === "preparing") {
      process.stdout.write("\rFetching metadata...");
    } else if (job.status === "running") {
      process.stdout.write(
        `\r[${job.title}] Ch ${job.currentChapterIndex + 1}/${job.totalChapters} - ${job.message}`
      );
    } else if (job.status === "done") {
      console.log(`\n\nSelesai! ${job.okImages} gambar berhasil didownload.`);
    } else if (job.status === "failed") {
      console.log(`\n\nGagal: ${job.error}`);
    }
  };

  scrape(url, count, chapterIdx, jobId, onChange).catch((err) => {
    console.error(`\nFatal: ${err.message}`);
    process.exit(1);
  });
}

// === TUI MODE ===
else {
  const {
    intro,
    outro,
    spinner,
    select,
    text,
    cancel,
    isCancel,
    note,
  } = await import("@clack/prompts");

  const PAGE_SIZE = 10;
  intro("MANGA SCRAPER + WAIFU2X SCALE");

  const hist = getComicHistory(10) as any[];
  if (hist.length > 0) {
    note(
      hist.map((h, i) => `${i + 1}. ${h.title} (${h.source})`).join("\n"),
      "Recent"
    );
  }

  const input = await text({
    message: "Masukkan nomor history atau paste URL:",
    placeholder: "https://...",
  });

  if (isCancel(input)) { cancel("Dibatalkan."); process.exit(0); }

  let comicUrl: string;
  const numMatch = input.match(/^(\d+)$/);
  if (numMatch) {
    const idx = parseInt(numMatch[1]);
    const entry = hist[idx - 1];
    if (!entry) { cancel("Invalid history index."); process.exit(1); }
    comicUrl = entry.url;
  } else {
    comicUrl = input;
  }

  if (!comicUrl.includes("https://")) {
    cancel("Invalid URL.");
    process.exit(1);
  }

  const scraper = detectScraper(comicUrl);
  if (!scraper) {
    cancel(`No scraper for: ${new URL(comicUrl).hostname}`);
    process.exit(1);
  }

  const fetchS = spinner();
  fetchS.start(`Fetching from ${scraper.name}...`);
  const comicTitle = await scraper.getComicTitle(comicUrl);
  const { id: comicId, slug } = resolveComic(comicTitle, comicUrl, scraper.name);
  const chapters = await scraper.listChapters(comicUrl);
  fetchS.stop(`📚 ${comicTitle} (${scraper.name})`);

  if (scraper.getMetadata) {
    fetchS.start("Fetching metadata...");
    const meta = await scraper.getMetadata(comicUrl);
    saveMetadata(slug, meta, scraper.referer);
    fetchS.stop(`✅ Metadata saved`);
  }

  if (!chapters.length) { cancel("No chapters found."); process.exit(1); }

  const downloadedChapters = getDownloadedChapters(comicId);
  const totalPages = Math.ceil(chapters.length / PAGE_SIZE);
  const downloadedSet = new Set(downloadedChapters);

  let info = `Total: ${chapters.length} chapter`;
  info += `\nAwal: ${chapters[0].label}`;
  info += `\nAkhir: ${chapters[chapters.length - 1].label}`;
  if (downloadedChapters.length > 0) {
    info += `\n✓ ${downloadedChapters.length} terunduh`;
  }
  note(info, "Status");

  let page = 0;
  let entry: ChapterEntry | null = null;

  while (!entry) {
    const start = page * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, chapters.length);
    const slice = chapters.slice(start, end);

    const options: { value: string; label: string; hint?: string; disabled?: boolean }[] = [];

    for (const e of slice) {
      const ch = scraper.parseChapter(e.url);
      const isDone = downloadedSet.has(ch);
      options.push({
        value: `${chapters.indexOf(e)}`,
        label: e.label,
        hint: isDone ? "✓" : undefined,
        disabled: isDone,
      });
    }

    if (end < chapters.length) {
      options.push({ value: "__next", label: `→ Halaman ${page + 2} (${end + 1}-${Math.min(end + PAGE_SIZE, chapters.length)})` });
    }
    if (page > 0) {
      options.push({ value: "__prev", label: `← Halaman ${page}` });
    }
    options.push({ value: "__custom", label: "Masukkan chapter manual..." });

    const picked = await select({
      message: `Pilih chapter (${page + 1}/${totalPages}):`,
      options,
    });

    if (isCancel(picked)) { cancel("Dibatalkan."); process.exit(0); }
    if (picked === "__next") { page++; continue; }
    if (picked === "__prev") { page--; continue; }
    if (picked === "__custom") {
      const chInput = await text({ message: "Masukkan chapter:", placeholder: "35.1" });
      if (isCancel(chInput)) { cancel("Dibatalkan."); process.exit(0); }
      const idx = chapters.findIndex((c) => scraper.parseChapter(c.url) === chInput);
      if (idx === -1) { note("Chapter tidak ditemukan.", "⚠️"); continue; }
      entry = chapters[idx];
      break;
    }

    const idx = parseInt(picked);
    if (!isNaN(idx) && chapters[idx]) {
      entry = chapters[idx];
    }
  }

  const startIndex = chapters.indexOf(entry);
  const remaining = chapters.length - startIndex;
  const howManyInput = await text({
    message: "Berapa chapter?",
    placeholder: `${remaining}`,
    defaultValue: `${remaining}`,
  });
  if (isCancel(howManyInput)) { cancel("Dibatalkan."); process.exit(0); }

  const howMany = parseInt(howManyInput);
  if (isNaN(howMany) || howMany < 1) { cancel("Invalid count."); process.exit(1); }

  note(`Mengunduh ${howMany} chapter dari ${entry.label}`, "📥");

  for (let i = startIndex; i < Math.min(startIndex + howMany, chapters.length); i++) {
    const c = chapters[i];
    const ch = scraper.parseChapter(c.url);

    if (isChapterAlreadyDone(comicId, ch)) {
      note(`${c.label} already complete.`, "⏭️");
      continue;
    }

    const images = await scraper.scrapeImages(c.url);
    if (!images.length) {
      cancel(`No images found for ${c.label}`);
      continue;
    }

    const chapterId = resolveChapter(comicId, ch, c.url, images.length);

    const s = spinner();
    s.start(`Processing ${c.label}`);
    let failed = 0;
    for (const [index, { src }] of images.entries()) {
      const ok = await ImageProcessor.processImage(
        src, index, slug, ch,
        chapterId, scraper.referer,
        (msg) => s.message(msg)
      );
      if (!ok) failed++;
    }
    finishChapter(chapterId, images.length - failed, images.length);
    s.stop(`${c.label}: ${images.length - failed}/${images.length}`);
  }

  outro("✅ Selesai!");
}
