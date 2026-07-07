import {
  intro,
  outro,
  spinner,
  select,
  text,
  cancel,
  isCancel,
  note,
} from "@clack/prompts";
import {
  ImageProcessor,
  utils,
  CONFIG,
  SiteScraper,
  ChapterEntry,
  getComicHistory,
  getDownloadedChapters,
  resolveComic,
  resolveChapter,
  isChapterAlreadyDone,
  finishChapter,
} from "./lib/core";
import { komikuScraper } from "./lib/sites/komiku";
import { mangatownScraper } from "./lib/sites/mangatown";

const SCRAPERS: SiteScraper[] = [komikuScraper, mangatownScraper];
const PAGE_SIZE = 10;

function detectScraper(url: string): SiteScraper | null {
  return SCRAPERS.find((s) => s.match(url)) || null;
}

class ComicProcessor {
  async processChapter(
    entry: ChapterEntry,
    slug: string,
    comicId: number,
    scraper: SiteScraper
  ): Promise<void> {
    const chapter = scraper.parseChapter(entry.url);

    if (isChapterAlreadyDone(comicId, chapter)) {
      note(`${entry.label} already complete.`, "⏭️");
      return;
    }

    const images = await scraper.scrapeImages(entry.url);
    if (!images.length) {
      cancel(`No images found for ${entry.label}`);
      return;
    }

    const chapterId = resolveChapter(comicId, chapter, entry.url, images.length);

    const s = spinner();
    s.start(`Processing ${entry.label}`);
    let failed = 0;
    for (const [index, { src }] of images.entries()) {
      const ok = await ImageProcessor.processImage(
        src, index, slug, chapter,
        chapterId, scraper.referer,
        (msg) => s.message(msg)
      );
      if (!ok) failed++;
    }
    finishChapter(chapterId, images.length - failed, images.length);
    s.stop(`${entry.label}: ${images.length - failed}/${images.length}`);
  }

  async pickChapter(
    chapters: ChapterEntry[],
    scraper: SiteScraper,
    downloaded: string[],
    totalPages: number
  ): Promise<{ entry: ChapterEntry } | null> {
    const downloadedSet = new Set(downloaded);
    let page = 0;

    while (true) {
      const start = page * PAGE_SIZE;
      const end = Math.min(start + PAGE_SIZE, chapters.length);
      const slice = chapters.slice(start, end);

      const options: { value: string; label: string; hint?: string; disabled?: boolean }[] = [];

      for (const entry of slice) {
        const ch = scraper.parseChapter(entry.url);
        const isDone = downloadedSet.has(ch);
        options.push({
          value: `${chapters.indexOf(entry)}`,
          label: entry.label,
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

      const lastDownloaded = downloaded.length > 0 ? downloaded[downloaded.length - 1] : null;
      if (lastDownloaded) {
        const nextIdx = chapters.findIndex((c, i) => {
          if (i === 0) return false;
          return downloadedSet.has(scraper.parseChapter(chapters[i - 1].url)) && !downloadedSet.has(scraper.parseChapter(c.url));
        });
        if (nextIdx !== -1) {
          options.push({ value: `${nextIdx}`, label: `→ Lanjutkan: ${chapters[nextIdx].label}` });
        }
      }

      const picked = await select({
        message: `Pilih chapter (${page + 1}/${totalPages}):`,
        options,
      });

      if (isCancel(picked)) return null;
      if (picked === "__next") { page++; continue; }
      if (picked === "__prev") { page--; continue; }
      if (picked === "__custom") {
        const chInput = await text({ message: "Masukkan chapter:", placeholder: "35.1" });
        if (isCancel(chInput)) return null;
        const idx = chapters.findIndex((c) => scraper.parseChapter(c.url) === chInput);
        if (idx === -1) { note("Chapter tidak ditemukan.", "⚠️"); continue; }
        return { entry: chapters[idx] };
      }

      const idx = parseInt(picked);
      if (!isNaN(idx) && chapters[idx]) {
        return { entry: chapters[idx] };
      }
    }
  }

  async start(): Promise<void> {
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

    if (!chapters.length) { cancel("No chapters found."); process.exit(1); }

    const downloadedChapters = getDownloadedChapters(comicId);
    const totalPages = Math.ceil(chapters.length / PAGE_SIZE);

    let info = `Total: ${chapters.length} chapter`;
    info += `\nAwal: ${chapters[0].label}`;
    info += `\nAkhir: ${chapters[chapters.length - 1].label}`;
    if (downloadedChapters.length > 0) {
      info += `\n✓ ${downloadedChapters.length} terunduh`;
    }
    note(info, "Status");

    const result = await this.pickChapter(chapters, scraper, downloadedChapters, totalPages);
    if (!result) { cancel("Dibatalkan."); process.exit(0); }

    const startIndex = chapters.indexOf(result.entry);
    const remaining = chapters.length - startIndex;
    const howManyInput = await text({
      message: "Berapa chapter?",
      placeholder: `${remaining}`,
      defaultValue: `${remaining}`,
    });
    if (isCancel(howManyInput)) { cancel("Dibatalkan."); process.exit(0); }

    const howMany = parseInt(howManyInput);
    if (isNaN(howMany) || howMany < 1) { cancel("Invalid count."); process.exit(1); }

    note(`Mengunduh ${howMany} chapter dari ${result.entry.label}`, "📥");

    for (let i = startIndex; i < Math.min(startIndex + howMany, chapters.length); i++) {
      await this.processChapter(chapters[i], slug, comicId, scraper);
    }

    outro("✅ Selesai!");
  }
}

new ComicProcessor().start();
