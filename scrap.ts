import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import dotenv from "dotenv";
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

dotenv.config();

const CONFIG = {
  WAIFU2X_PATH:
    process.env.WAIFU2X_PATH || "~/Repos/tools/waifu2x/waifu2x-ncnn-vulkan",
  BASE_KOMIKU_URL: process.env.BASE_KOMIKU_URL || "https://komiku.org",
  OUTPUT_DIR: process.env.OUTPUT_DIR || path.join(__dirname, "komik"),
  MIN_IMAGE_SIZE: parseInt(process.env.MIN_IMAGE_SIZE || "900"),
  MAX_IMAGE_SIZE: parseInt(process.env.MAX_IMAGE_SIZE || "1024"),
  NOISE_REDUCTION: process.env.NOISE_REDUCTION || "2",
  SCALE_FACTOR: process.env.SCALE_FACTOR || "2",
  HISTORY_FILE: path.join(__dirname, "history.txt"),
  MAX_HISTORY: 10,
} as const;

interface ImageData {
  src: string;
  alt: string;
}

interface ComicHistory {
  url: string;
  title: string;
  lastAccessed: string;
}

class HistoryManager {
  private history: ComicHistory[] = [];

  constructor() {
    this.loadHistory();
  }

  private loadHistory(): void {
    try {
      if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        const data = fs.readFileSync(CONFIG.HISTORY_FILE, "utf8");
        this.history = JSON.parse(data);
      }
    } catch {
      this.history = [];
    }
  }

  private saveHistory(): void {
    try {
      fs.writeFileSync(
        CONFIG.HISTORY_FILE,
        JSON.stringify(this.history, null, 2)
      );
    } catch {}
  }

  addToHistory(url: string, title: string): void {
    const existingIndex = this.history.findIndex((h) => h.url === url);
    const newEntry = { url, title, lastAccessed: new Date().toISOString() };
    if (existingIndex !== -1) this.history.splice(existingIndex, 1);
    this.history.unshift(newEntry);
    if (this.history.length > CONFIG.MAX_HISTORY) this.history.pop();
    this.saveHistory();
  }

  getHistory(): ComicHistory[] {
    return this.history;
  }

  getHistoryOptions() {
    return this.history.map((entry, index) => ({
      value: entry.url,
      label: `${index + 1}. ${entry.title}`,
      hint: entry.url,
    }));
  }

  getUrlByIndex(index: number): string | null {
    return this.history[index - 1]?.url || null;
  }
}

const utils = {
  async retry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch {
        if (i === retries - 1) throw new Error(`Failed after ${retries} attempts`);
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
    throw new Error("unreachable");
  },

  ensureFolderExists(folderPath: string): void {
    if (!fs.existsSync(folderPath))
      fs.mkdirSync(folderPath, { recursive: true });
  },

  parseChapter(url: string): string {
    const chapterRaw = url
      .split("chapter-")[1]
      ?.split("-bahasa-indonesia")[0]
      ?.split("/")[0];
    const parts = chapterRaw?.split("-") || [];
    return parts.length > 2 ? parts[0] : chapterRaw || "unknown";
  },

  getImageSavePath(
    comicName: string,
    chapter: string,
    fileName: string
  ): string {
    const folderPath = path.join(CONFIG.OUTPUT_DIR, comicName, chapter);
    utils.ensureFolderExists(folderPath);
    return path.join(folderPath, fileName);
  },

  areImagesComplete(folderPath: string, expectedCount: number): boolean {
    if (!fs.existsSync(folderPath)) return false;
    const files = fs
      .readdirSync(folderPath)
      .filter((file) => file.endsWith(".png"));
    return files.length === expectedCount;
  },

  getDownloadedChapters(comicTitle: string): string[] {
    const comicPath = path.join(CONFIG.OUTPUT_DIR, comicTitle);
    if (!fs.existsSync(comicPath)) return [];
    try {
      return fs
        .readdirSync(comicPath)
        .filter((folder) => {
          const folderPath = path.join(comicPath, folder);
          return (
            fs.statSync(folderPath).isDirectory() &&
            fs.readdirSync(folderPath).some((file) => file.endsWith(".png"))
          );
        })
        .sort((a, b) => {
          const numA = parseFloat(a.replace("-", ".")) || 0;
          const numB = parseFloat(b.replace("-", ".")) || 0;
          return numA - numB;
        });
    } catch {
      return [];
    }
  },

  getNextChapterIndex(
    chapters: string[],
    lastDownloadedChapter: string
  ): number {
    const lastClean = lastDownloadedChapter.replace("-", ".");
    for (let i = 0; i < chapters.length; i++) {
      const current = utils.parseChapter(chapters[i]).replace("-", ".");
      if (parseFloat(current) > parseFloat(lastClean)) return i;
    }
    return -1;
  },
};

const api = {
  async scrapeImages(url: string): Promise<ImageData[]> {
    try {
      const { data } = await axios.get(url);
      const $ = cheerio.load(data);
      return $("#Baca_Komik img.ww")
        .map((_, el) => ({
          src: $(el).attr("src") || "",
          alt: $(el).attr("alt") || "",
        }))
        .get();
    } catch (error) {
      console.error(`Error scraping images from ${url}:`, error);
      return [];
    }
  },

  async downloadImage(url: string, outputPath: string): Promise<void> {
    await utils.retry(async () => {
      const response = await axios({
        url,
        method: "GET",
        responseType: "stream",
        headers: { Referer: "https://komiku.org/" },
      });
      await new Promise((resolve, reject) => {
        response.data
          .pipe(fs.createWriteStream(outputPath))
          .on("finish", resolve)
          .on("error", reject);
      });
    });
  },

  async listChapters(comicUrl: string): Promise<string[]> {
    try {
      const { data } = await axios.get(comicUrl);
      const $ = cheerio.load(data);
      return $("td.judulseries a")
        .map((_, el) => $(el).attr("href") || "")
        .get()
        .map((href) => `${CONFIG.BASE_KOMIKU_URL}${href}`)
        .reverse();
    } catch {
      return [];
    }
  },

  async getComicTitle(comicUrl: string): Promise<string> {
    try {
      const { data } = await axios.get(comicUrl);
      const $ = cheerio.load(data);
      const title = $("h1.judul").text().trim();
      return (
        title || comicUrl.split("manga/")[1]?.split("/")[0] || "unknown_comic"
      );
    } catch {
      return comicUrl.split("manga/")[1]?.split("/")[0] || "unknown_comic";
    }
  },
};

class ImageProcessor {
  static scaleImage(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = `${CONFIG.WAIFU2X_PATH} -i "${inputPath}" -o "${outputPath}" -n ${CONFIG.NOISE_REDUCTION} -s ${CONFIG.SCALE_FACTOR}`;
      exec(command, (error) => (error ? reject(error) : resolve()));
    });
  }

  static async processImage(
    src: string,
    index: number,
    comicTitle: string,
    chapter: string,
    s: ReturnType<typeof spinner>
  ): Promise<boolean> {
    const rawFileName = `raw_image_${index + 1}.jpg`;
    const scaledFileName = `scaled_image_${index + 1}.png`;
    const skipScaledFileName = `scaled_image_${index + 1}_skip_.png`;

    const rawFilePath = utils.getImageSavePath(comicTitle, chapter, rawFileName);
    const scaledFilePath = utils.getImageSavePath(comicTitle, chapter, scaledFileName);
    const skipScaledFilePath = utils.getImageSavePath(comicTitle, chapter, skipScaledFileName);

    try {
      s.message(`Downloading image ${index + 1}...`);
      await api.downloadImage(src, rawFilePath);

      const rawSize = fs.statSync(rawFilePath).size;
      if (rawSize > CONFIG.MIN_IMAGE_SIZE * 1024) {
        s.message(`Image ${index + 1} is large enough, skipping scaling...`);
        fs.renameSync(rawFilePath, skipScaledFilePath);
      } else {
        s.message(`Scaling image ${index + 1}...`);
        await this.scaleImage(rawFilePath, scaledFilePath);
        const scaledSize = fs.statSync(scaledFilePath).size;
        if (scaledSize < CONFIG.MAX_IMAGE_SIZE * 1024) {
          s.message(`Retrying scaling for image ${index + 1}...`);
          await this.scaleImage(rawFilePath, scaledFilePath);
        }
        fs.unlinkSync(rawFilePath);
      }
      return true;
    } catch (error) {
      console.error(`Error processing image ${index + 1}:`, error);
      return false;
    }
  }
}

class ComicProcessor {
  private historyManager: HistoryManager;

  constructor() {
    this.historyManager = new HistoryManager();
  }

  async processChapter(chapterUrl: string, comicTitle: string): Promise<void> {
    const chapter = utils.parseChapter(chapterUrl);

    const images = await api.scrapeImages(chapterUrl);
    if (!images.length) {
      cancel(`No images found for chapter ${chapter}`);
      return;
    }

    const folderPath = path.join(CONFIG.OUTPUT_DIR, comicTitle, chapter);
    if (utils.areImagesComplete(folderPath, images.length)) {
      note(`Chapter ${chapter} already downloaded.`, "⏭️");
      return;
    }

    const s = spinner();
    s.start(`Processing Chapter ${chapter}`);
    let failed = 0;
    for (const [index, { src }] of images.entries()) {
      const ok = await ImageProcessor.processImage(src, index, comicTitle, chapter, s);
      if (!ok) failed++;
    }
    s.stop(`Chapter ${chapter}: ${images.length - failed}/${images.length} images`);
  }

  findChapterIndex(chapters: string[], targetChapter: string): number {
    const cleanTarget = targetChapter.replace("chapter-", "");
    return chapters.findIndex(
      (chapter) => utils.parseChapter(chapter) === cleanTarget
    );
  }

  async start(): Promise<void> {
    intro("KOMIKU SCRAP + WAIFU2X SCALE");

    const history = this.historyManager.getHistory();
    if (history.length > 0) {
      note(
        history.map((h, i) => `${i + 1}. ${h.title}`).join("\n"),
        "Recent Comics"
      );
    }

    let comicUrl: string;
    const historyChoice = await text({
      message: "Masukkan nomor history atau paste URL baru:",
      placeholder: "https://komiku.org/manga/...",
    });

    if (isCancel(historyChoice)) {
      cancel("Dibatalkan.");
      process.exit(0);
    }

    if (/^\d+$/.test(historyChoice)) {
      const historyUrl = this.historyManager.getUrlByIndex(parseInt(historyChoice));
      if (!historyUrl) {
        cancel("Indeks history tidak valid.");
        process.exit(1);
      }
      comicUrl = historyUrl;
    } else {
      comicUrl = historyChoice;
    }

    if (!comicUrl.includes("https://")) {
      cancel("URL komik tidak valid.");
      process.exit(1);
    }

    const fetchS = spinner();
    fetchS.start("Mengambil informasi komik...");
    const comicTitle = await api.getComicTitle(comicUrl);
    this.historyManager.addToHistory(comicUrl, comicTitle);
    fetchS.stop(`📚 ${comicTitle}`);

    const chapters = await api.listChapters(comicUrl);
    if (!chapters.length) {
      cancel("Tidak ada chapter ditemukan.");
      process.exit(1);
    }

    const downloadedChapters = utils.getDownloadedChapters(comicTitle);
    const lastDownloadedChapter = downloadedChapters.length > 0
      ? downloadedChapters[downloadedChapters.length - 1]
      : null;

    let info = `Total: ${chapters.length} chapter`;
    if (chapters.length > 0) {
      info += `\nPertama: Chapter ${utils.parseChapter(chapters[0])}`;
      info += `\nTerakhir: Chapter ${utils.parseChapter(chapters[chapters.length - 1])}`;
    }
    if (downloadedChapters.length > 0) {
      info += `\nTerunduh: ${downloadedChapters.length} (terakhir: ${lastDownloadedChapter})`;
      const nextChapterIndex = utils.getNextChapterIndex(chapters, lastDownloadedChapter!);
      if (nextChapterIndex !== -1) {
        info += `\nSelanjutnya: Chapter ${utils.parseChapter(chapters[nextChapterIndex])}`;
      }
    }
    note(info, "Status");

    const options: { value: string; label: string }[] = [
      { value: "specific", label: "Unduh dari chapter tertentu" },
    ];

    const nextChapterIndex = lastDownloadedChapter
      ? utils.getNextChapterIndex(chapters, lastDownloadedChapter)
      : -1;
    if (lastDownloadedChapter && nextChapterIndex !== -1) {
      const nextCh = utils.parseChapter(chapters[nextChapterIndex]);
      options.push({
        value: "continue",
        label: `Lanjutkan dari Chapter ${nextCh}`,
      });
    }

    const downloadOption = await select({
      message: "Pilih opsi download:",
      options,
    });

    if (isCancel(downloadOption)) {
      cancel("Dibatalkan.");
      process.exit(0);
    }

    let startIndex = 0;
    let targetChapter = "";

    if (downloadOption === "continue") {
      startIndex = nextChapterIndex;
      targetChapter = utils.parseChapter(chapters[nextChapterIndex]);
    } else {
      const chapterInput = await text({
        message: "Masukkan chapter (contoh: 35.1 atau 35-1):",
        placeholder: "35.1",
      });

      if (isCancel(chapterInput)) {
        cancel("Dibatalkan.");
        process.exit(0);
      }

      targetChapter = chapterInput;
      const formattedChapter = targetChapter.replace(".", "-");
      startIndex = this.findChapterIndex(chapters, `chapter-${formattedChapter}`);
      if (startIndex === -1) {
        cancel("Chapter tidak ditemukan.");
        process.exit(1);
      }
    }

    const totalChapters = chapters.length - startIndex;
    const howManyInput = await text({
      message: "Berapa chapter yang ingin diunduh?",
      placeholder: `${totalChapters}`,
      defaultValue: `${totalChapters}`,
    });

    if (isCancel(howManyInput)) {
      cancel("Dibatalkan.");
      process.exit(0);
    }

    const howMany = parseInt(howManyInput);
    if (isNaN(howMany) || howMany < 1) {
      cancel("Jumlah chapter tidak valid.");
      process.exit(1);
    }

    note(`Mengunduh ${howMany} chapter dari Chapter ${targetChapter}`, "📥");

    for (
      let i = startIndex;
      i < Math.min(startIndex + howMany, chapters.length);
      i++
    ) {
      await this.processChapter(chapters[i], comicTitle);
    }

    outro("✅ Semua download selesai!");
  }
}

new ComicProcessor().start();
