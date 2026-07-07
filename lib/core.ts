import fs from "fs";
import path from "path";
import { exec } from "child_process";
import axios from "axios";
import dotenv from "dotenv";
import {
  upsertComic,
  upsertChapter,
  upsertImage,
  markImageDone,
  markImageSkip,
  markImageFailed,
  markChapterComplete,
  isChapterComplete,
  getDownloadedChapters,
  getChapterImages,
  getComicHistory,
} from "./db";

dotenv.config();

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export const CONFIG = {
  WAIFU2X_PATH: process.env.WAIFU2X_PATH || "~/Repos/tools/waifu2x/waifu2x-ncnn-vulkan",
  OUTPUT_DIR: process.env.OUTPUT_DIR || path.join(import.meta.dir, "..", "komik"),
  MIN_IMAGE_SIZE: parseInt(process.env.MIN_IMAGE_SIZE || "900"),
  MAX_IMAGE_SIZE: parseInt(process.env.MAX_IMAGE_SIZE || "1024"),
  NOISE_REDUCTION: process.env.NOISE_REDUCTION || "2",
  SCALE_FACTOR: process.env.SCALE_FACTOR || "2",
} as const;

export interface ImageData {
  src: string;
  alt: string;
}

export interface ChapterEntry {
  url: string;
  label: string;
}

export interface SiteScraper {
  name: string;
  referer: string;
  match(url: string): boolean;
  getComicTitle(url: string): Promise<string>;
  listChapters(url: string): Promise<ChapterEntry[]>;
  scrapeImages(chapterUrl: string): Promise<ImageData[]>;
  parseChapter(url: string): string;
}

// Re-export DB functions
export { getComicHistory, getDownloadedChapters };

export const utils = {
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
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
  },

  getImageSavePath(comicTitle: string, chapter: string, fileName: string): string {
    const folderPath = path.join(CONFIG.OUTPUT_DIR, comicTitle, chapter);
    this.ensureFolderExists(folderPath);
    return path.join(folderPath, fileName);
  },

  getNextChapterIndex(chapters: string[], parser: (url: string) => string, lastChapter: string): number {
    const lastClean = lastChapter.replace("-", ".");
    for (let i = 0; i < chapters.length; i++) {
      const current = parser(chapters[i]).replace("-", ".");
      if (parseFloat(current) > parseFloat(lastClean)) return i;
    }
    return -1;
  },
};

export async function downloadImage(url: string, outputPath: string, referer?: string): Promise<void> {
  await utils.retry(async () => {
    const response = await axios({
      url,
      method: "GET",
      responseType: "stream",
      headers: referer ? { Referer: referer } : {},
    });
    await new Promise((resolve, reject) => {
      response.data
        .pipe(fs.createWriteStream(outputPath))
        .on("finish", resolve)
        .on("error", reject);
    });
  });
}

export class ImageProcessor {
  static scaleImage(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const cmd = `${CONFIG.WAIFU2X_PATH} -i "${inputPath}" -o "${outputPath}" -n ${CONFIG.NOISE_REDUCTION} -s ${CONFIG.SCALE_FACTOR}`;
      exec(cmd, (error) => (error ? reject(error) : resolve()));
    });
  }

  static async processImage(
    src: string,
    index: number,
    comicTitle: string,
    chapter: string,
    chapterId: number,
    referer: string,
    message: (msg: string) => void
  ): Promise<boolean> {
    const ext = src.match(/\.(webp)$/i) ? "webp" : "jpg";
    const rawFileName = `raw_${index + 1}.${ext}`;
    const scaledFileName = `${index + 1}.png`;
    const skipFileName = `${index + 1}_skip.png`;

    const rawPath = utils.getImageSavePath(comicTitle, chapter, rawFileName);
    const scaledPath = utils.getImageSavePath(comicTitle, chapter, scaledFileName);
    const skipPath = utils.getImageSavePath(comicTitle, chapter, skipFileName);

    try {
      upsertImage(chapterId, index + 1, src);

      message(`Downloading image ${index + 1}...`);
      await downloadImage(src, rawPath, referer);

      const rawSize = fs.statSync(rawPath).size;
      if (rawSize > CONFIG.MIN_IMAGE_SIZE * 1024) {
        message(`Image ${index + 1} is large enough, skipping...`);
        fs.renameSync(rawPath, skipPath);
        markImageSkip(chapterId, index + 1, skipFileName, rawSize);
      } else {
        message(`Scaling image ${index + 1}...`);
        await this.scaleImage(rawPath, scaledPath);
        const scaledSize = fs.statSync(scaledPath).size;
        if (scaledSize < CONFIG.MAX_IMAGE_SIZE * 1024) {
          message(`Retrying scaling...`);
          await this.scaleImage(rawPath, scaledPath);
        }
        fs.unlinkSync(rawPath);
        markImageDone(chapterId, index + 1, rawFileName, scaledFileName, rawSize, fs.statSync(scaledPath).size);
      }
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`Error image ${index + 1}:`, msg);
      markImageFailed(chapterId, index + 1, msg);
      return false;
    }
  }
}

// Comic helper
export function resolveComic(title: string, url: string, source: string) {
  const slug = slugify(title);
  return { id: upsertComic(title, url, source, slug), slug };
}

export function resolveChapter(comicId: number, chapterNum: string, chapterUrl: string, totalImages: number) {
  return upsertChapter(comicId, chapterNum, chapterUrl, totalImages);
}

export function isChapterAlreadyDone(comicId: number, chapterNum: string): boolean {
  return isChapterComplete(comicId, chapterNum);
}

export function finishChapter(chapterId: number, okCount: number, total: number) {
  markChapterComplete(chapterId, okCount, total);
}
