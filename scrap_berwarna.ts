import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import ora from "ora";
import dotenv from "dotenv";
import type { Ora } from "ora";

dotenv.config();

const CONFIG = {
  WAIFU2X_PATH: process.env.WAIFU2X_PATH || "F:/BOT/manga-scaler/waifu2x/waifu2x-ncnn-vulkan.exe", //ganti sesuai lokasi waifu2x-ncnn-vulkan di sistem Anda
  OUTPUT_DIR: process.env.OUTPUT_DIR || path.join(__dirname, "komik"),
  MIN_IMAGE_SIZE: parseInt(process.env.MIN_IMAGE_SIZE || "900"),
  MAX_IMAGE_SIZE: parseInt(process.env.MAX_IMAGE_SIZE || "1024"),
  NOISE_REDUCTION: process.env.NOISE_REDUCTION || "2",
  SCALE_FACTOR: process.env.SCALE_FACTOR || "2",
  HISTORY_FILE: path.join(__dirname, "history-berwarna.txt"),
  MAX_HISTORY: 10,
};

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
      fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(this.history, null, 2));
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

  showHistory(): void {
    if (this.history.length === 0) {
      console.log("No history found.");
      return;
    }
    console.log("\nRecent Comics:");
    this.history.forEach((entry, index) => {
      console.log(`${index + 1}. ${entry.title} (${entry.url})`);
    });
  }

  getUrlByIndex(index: number): string | null {
    return this.history[index - 1]?.url || null;
  }
}

const utils = {
  ensureFolderExists(folderPath: string): void {
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
  },
  getImageSavePath(chapter: string, fileName: string): string {
    const folderPath = path.join(CONFIG.OUTPUT_DIR, "one-piece-berwarna-indo", chapter);
    utils.ensureFolderExists(folderPath);
    return path.join(folderPath, fileName);
  },
  areImagesComplete(folderPath: string, expectedCount: number): boolean {
    if (!fs.existsSync(folderPath)) return false;
    const files = fs.readdirSync(folderPath).filter((file) => file.endsWith(".png"));
    return files.length === expectedCount;
  },
  getDownloadedChapters(): string[] {
    const comicPath = path.join(CONFIG.OUTPUT_DIR, "one-piece-berwarna-indo");
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
        .sort((a, b) => parseFloat(a) - parseFloat(b));
    } catch {
      return [];
    }
  },
  formatChapterDisplay(chapter: string, isDownloaded: boolean): string {
    return `${chapter}${isDownloaded ? " ✓" : ""}`;
  },
};

const api = {
  async scrapeImages(url: string): Promise<ImageData[]> {
    try {
      const { data } = await axios.get(url);
      const $ = cheerio.load(data);
      // Hanya ambil gambar di dalam .main-reading-area atau .reading-content
      let mainContent = $('.main-reading-area');
      if (mainContent.length === 0) mainContent = $('.reading-content');
      if (mainContent.length === 0) mainContent = $('article');
      return mainContent.find('img')
        .map((_, el) => {
          const src = $(el).attr("src") || "";
          const alt = $(el).attr("alt") || "";
          if (
            /\.(jpg|jpeg|png)$/i.test(src) &&
            !/logo|banner|iklan|ads|wp-content\/themes/i.test(src)
          ) {
            return { src, alt };
          }
          return null;
        })
        .get()
        .filter(Boolean);
    } catch (error) {
      console.error(`Error scraping images from ${url}:`, error);
      return [];
    }
  },

  async downloadImage(url: string, outputPath: string): Promise<void> {
    try {
      const response = await axios({ url, method: "GET", responseType: "stream" });
      await new Promise((resolve, reject) => {
        response.data
          .pipe(fs.createWriteStream(outputPath))
          .on("finish", resolve)
          .on("error", reject);
      });
    } catch (error) {
      console.error(`Error downloading image ${url}:`, error);
    }
  },

  async getComicTitle(url: string): Promise<string> {
    // Untuk onepieceberwarna, judul bisa diambil dari URL
    const match = url.match(/one-piece-berwarna-chapter-(\d+)/i);
    return match ? "one-piece-berwarna" : "unknown";
  },

  async listChapters(): Promise<string[]> {
    // Generate daftar chapter dari 1 sampai terbaru (misal 1200)
    // Atau bisa scraping dari halaman utama jika ingin dinamis
    const latest = 1200; // Ganti sesuai jumlah chapter terbaru
    return Array.from({ length: latest }, (_, i) => (i + 1).toString());
  },
};

class ImageProcessor {
  static scaleImage(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = `"${CONFIG.WAIFU2X_PATH}" -i "${inputPath}" -o "${outputPath}" -n ${CONFIG.NOISE_REDUCTION} -s ${CONFIG.SCALE_FACTOR}`;
      exec(command, (error) => (error ? reject(error) : resolve()));
    });
  }

  static async processImage(
    src: string,
    index: number,
    chapter: string,
    spinner: Ora
  ): Promise<void> {
    const rawFileName = `raw_image_${index + 1}.jpg`;
    const scaledFileName = `scaled_image_${index + 1}.png`;
    const rawFilePath = utils.getImageSavePath(chapter, rawFileName);
    const scaledFilePath = utils.getImageSavePath(chapter, scaledFileName);

    try {
      spinner.text = `Downloading image ${index + 1}...`;
      await api.downloadImage(src, rawFilePath);

      spinner.text = `⠙ Scaling image ${index + 1}...`;
      await this.scaleImage(rawFilePath, scaledFilePath);

      fs.unlinkSync(rawFilePath); // Hapus raw setelah upscale
      spinner.text = `Image ${index + 1} done`;
    } catch (error) {
      spinner.text = `Error image ${index + 1}`;
      console.error(`Error processing image ${index + 1}:`, error);
    }
  }
}

class ComicProcessor {
  private historyManager: HistoryManager;

  constructor() {
    this.historyManager = new HistoryManager();
  }

  async processChapter(chapterNum: string): Promise<void> {
    const url = `https://onepieceberwarna.com/one-piece-berwarna-chapter-${chapterNum}/`;
    console.log(`\nProcessing Chapter: ${chapterNum}`);

    const images = await api.scrapeImages(url);
    if (!images.length) {
      console.warn(`No images found for chapter ${chapterNum}`);
      return;
    }

    const folderPath = path.join(CONFIG.OUTPUT_DIR, "one-piece-berwarna-indo", chapterNum);
    if (utils.areImagesComplete(folderPath, images.length)) {
      console.log(`Images for Chapter ${chapterNum} are already downloaded.`);
      return;
    }

    const spinner = ora(`Processing Chapter ${chapterNum}`).start();
    for (const [index, { src }] of images.entries()) {
      await ImageProcessor.processImage(src, index, chapterNum, spinner);
    }
    spinner.succeed(`Finished processing Chapter: ${chapterNum}`);
  }

  displayChaptersInfo(chapters: string[]): void {
    const downloadedChapters = utils.getDownloadedChapters();
    if (downloadedChapters.length > 0) {
      const lastTenChapters = downloadedChapters.slice(-10);
      const lastChapter = downloadedChapters[downloadedChapters.length - 1];
      const nextChapterIndex = chapters.findIndex((c) => c === (parseInt(lastChapter) + 1).toString());

      console.log(`\n┌─────────────────────────────┐`);
      console.log(`│ 💾 CHAPTER TERUNDUH (${downloadedChapters.length})     │`);
      console.log(`└─────────────────────────────┘`);
      if (lastTenChapters.length > 0) {
        lastTenChapters.forEach((chapter) => {
          console.log(`   • Chapter ${chapter} ✓`);
        });
        if (downloadedChapters.length > 10) {
          console.log(`   • ... dan ${downloadedChapters.length - 10} chapter lainnya`);
        }
      }
      if (lastChapter) {
        console.log(`\n📌 Chapter terakhir yang diunduh: Chapter ${lastChapter}`);
        if (nextChapterIndex !== -1) {
          const nextChapter = chapters[nextChapterIndex];
          console.log(`📥 Chapter berikutnya tersedia: Chapter ${nextChapter}`);
        } else {
          console.log(`✅ Semua chapter sudah diunduh!`);
        }
      }
    } else {
      console.log(`\n❗ Belum ada chapter yang diunduh`);
      console.log(`💡 Total chapter tersedia: ${chapters.length}`);
      console.log(`💡 Chapter pertama: Chapter ${chapters[0]}`);
      console.log(`💡 Chapter terakhir: Chapter ${chapters[chapters.length - 1]}`);
    }
  }

  async start(): Promise<void> {
    console.clear();
    console.log(`
┌──────────────────────────────────────────────┐
│                                              │
│  ONE PIECE BERWARNA SCRAPER + WAIFU2X SCALE  │
│                                              │
└──────────────────────────────────────────────┘
    `);

    this.historyManager.showHistory();

    const historyChoice = prompt("\nMasukkan nomor history atau paste URL baru: ");
    if (!historyChoice) {
      console.error("Tidak ada input yang diberikan");
      return;
    }

    let comicUrl = "";
    if (/^\d+$/.test(historyChoice)) {
      const historyUrl = this.historyManager.getUrlByIndex(parseInt(historyChoice));
      if (!historyUrl) {
        console.error("Indeks history tidak valid.");
        return;
      }
      comicUrl = historyUrl;
    } else {
      comicUrl = historyChoice;
    }

    if (!comicUrl.includes("https://")) {
      console.error("URL komik tidak valid.");
      return;
    }

    const comicTitle = await api.getComicTitle(comicUrl);
    this.historyManager.addToHistory(comicUrl, comicTitle);

    // Daftar chapter (bisa scraping dari halaman utama jika ingin dinamis)
    const chapters = await api.listChapters();

    console.log(`\n✅ Ditemukan ${chapters.length} chapter total`);
    this.displayChaptersInfo(chapters);

    const downloadedChapters = utils.getDownloadedChapters();
    const lastDownloadedChapter = downloadedChapters.length > 0
      ? downloadedChapters[downloadedChapters.length - 1]
      : null;
    let nextChapterIndex = -1;
    if (lastDownloadedChapter) {
      nextChapterIndex = chapters.findIndex((c) => c === (parseInt(lastDownloadedChapter) + 1).toString());
    }

    // Opsi unduhan
    console.log(`\nOpsi Download:`);
    console.log(`1. Unduh dari chapter tertentu`);
    if (lastDownloadedChapter && nextChapterIndex !== -1) {
      const nextChapter = chapters[nextChapterIndex];
      console.log(`2. Lanjutkan unduhan dari Chapter ${nextChapter} (setelah Chapter ${lastDownloadedChapter})`);
    } else if (lastDownloadedChapter) {
      console.log(`2. [Tidak tersedia] Semua chapter sudah diunduh`);
    } else {
      console.log(`2. [Tidak tersedia] Belum ada chapter yang diunduh`);
    }

    const downloadOption = prompt("\nPilih opsi (1/2): ");
    if (!downloadOption) {
      console.error("Tidak ada opsi yang dipilih");
      return;
    }

    let startIndex = 0;
    let targetChapter = "";

    if (downloadOption === "2") {
      if (lastDownloadedChapter && nextChapterIndex !== -1) {
        startIndex = nextChapterIndex;
        targetChapter = chapters[nextChapterIndex];
        console.log(`\n📥 Melanjutkan unduhan dari Chapter ${targetChapter} (setelah Chapter ${lastDownloadedChapter})`);
      } else {
        console.error("Opsi tidak tersedia. Tidak ada chapter berikutnya untuk diunduh.");
        return;
      }
    } else {
      const chapterInput = prompt("\nMasukkan chapter (contoh: 1110): ");
      if (!chapterInput) {
        console.error("Tidak ada chapter yang diberikan");
        return;
      }
      targetChapter = chapterInput;
      startIndex = chapters.findIndex((c) => c === targetChapter);
      if (startIndex === -1) {
        console.error("Chapter tidak ditemukan.");
        return;
      }
    }

    const totalChapters = chapters.length - startIndex;
    const howManyInput = prompt(`Berapa chapter yang ingin diunduh? (default: ${totalChapters}): `);
    const howMany = parseInt(howManyInput || `${totalChapters}`);

    if (isNaN(howMany) || howMany < 1) {
      console.error("Jumlah chapter tidak valid.");
      return;
    }

    console.log(`\n📥 Mengunduh ${howMany} chapter dimulai dari Chapter ${targetChapter}...`);

    for (let i = startIndex; i < Math.min(startIndex + howMany, chapters.length); i++) {
      await this.processChapter(chapters[i]);
    }

    console.log(`\n✅ Semua download selesai!`);
  }
}

new ComicProcessor().start();
