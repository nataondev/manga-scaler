import fs from "fs";
import path from "path";
import { exec } from "child_process";
import axios from "axios";
import sharp from "sharp";
import dotenv from "dotenv";
import {
  upsertComic,
  upsertChapter,
  upsertImage,
  markImageDone,
  markImageFailed,
  markChapterComplete,
  isChapterComplete,
  getDownloadedChapters,
  getComicHistory,
} from "./db";

dotenv.config();

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export const CONFIG = {
  WAIFU2X_PATH: process.env.WAIFU2X_PATH || "~/Repos/tools/waifu2x/waifu2x-ncnn-vulkan",
  OUTPUT_DIR: process.env.OUTPUT_DIR || path.join(import.meta.dir, "..", "komik"),
  MIN_IMAGE_WIDTH: parseInt(process.env.MIN_IMAGE_WIDTH || "900"),
  WEBP_QUALITY: parseInt(process.env.WEBP_QUALITY || "85"),
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
  getMetadata?(url: string): Promise<ComicMetadata>;
  listChapters(url: string): Promise<ChapterEntry[]>;
  scrapeImages(chapterUrl: string): Promise<ImageData[]>;
  parseChapter(url: string): string;
}

export interface ComicMetadata {
  title?: string;
  alternativeName?: string;
  author?: string[];
  artist?: string[];
  genre?: string[];
  theme?: string[];
  status?: string;
  type?: string;
  rating?: string;
  readingDirection?: string;
  totalViews?: string;
  summary?: string;
  coverUrl?: string;
}

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

  getImageSavePath(slug: string, chapter: string, fileName: string): string {
    const folderPath = path.join(CONFIG.OUTPUT_DIR, slug, chapter);
    this.ensureFolderExists(folderPath);
    return path.join(folderPath, fileName);
  },

  getNextChapterIndex(
    chapters: { url: string; label: string }[],
    parser: (url: string) => string,
    lastChapter: string
  ): number {
    const lastClean = lastChapter.replace("-", ".");
    for (let i = 0; i < chapters.length; i++) {
      const current = parser(chapters[i].url).replace("-", ".");
      if (parseFloat(current) > parseFloat(lastClean)) return i;
    }
    return -1;
  },

  async waifu2x(inputPath: string, outputPath: string): Promise<void> {
    const cmd = `${CONFIG.WAIFU2X_PATH} -i "${inputPath}" -o "${outputPath}" -n ${CONFIG.NOISE_REDUCTION} -s ${CONFIG.SCALE_FACTOR}`;
    return new Promise((resolve, reject) => {
      exec(cmd, (error) => (error ? reject(error) : resolve()));
    });
  },
};

export class ImageProcessor {
  static async processImage(
    src: string,
    index: number,
    slug: string,
    chapter: string,
    chapterId: number,
    referer: string,
    message: (msg: string) => void
  ): Promise<boolean> {
    const rawFile = `raw_${index + 1}.tmp`;
    const rawPath = utils.getImageSavePath(slug, chapter, rawFile);
    const outputFile = `${index + 1}.webp`;
    const outputPath = utils.getImageSavePath(slug, chapter, outputFile);

    try {
      upsertImage(chapterId, index + 1, src);

      message(`Downloading ${index + 1}...`);
      const buf = await utils.retry(async () => {
        const res = await axios.get(src, {
          responseType: "arraybuffer",
          timeout: 30000,
          headers: { Referer: referer },
        });
        return Buffer.from(res.data);
      });

      fs.writeFileSync(rawPath, buf);
      const rawSize = buf.length;
      const meta = await sharp(buf).metadata();
      const origWidth = meta.width || 0;

      if (origWidth >= CONFIG.MIN_IMAGE_WIDTH) {
        message(`${index + 1} (${origWidth}px), direct WebP...`);
        fs.unlinkSync(rawPath);
        await sharp(buf)
          .webp({ quality: CONFIG.WEBP_QUALITY })
          .toFile(outputPath);
      } else {
        message(`${index + 1} AI upscale (${origWidth}px)...`);
        const scaledPng = rawPath.replace(/\.tmp$/, ".png");
        await utils.waifu2x(rawPath, scaledPng);
        fs.unlinkSync(rawPath);

        message(`${index + 1} WebP compress...`);
        await sharp(scaledPng)
          .webp({ quality: CONFIG.WEBP_QUALITY })
          .toFile(outputPath);
        fs.unlinkSync(scaledPng);
      }

      const outputSize = fs.statSync(outputPath).size;
      markImageDone(chapterId, index + 1, outputFile, rawSize, outputSize);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`Error image ${index + 1}:`, msg);
      try { if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath); } catch {}
      markImageFailed(chapterId, index + 1, msg);
      return false;
    }
  }
}

export function resolveComic(title: string, url: string, source: string) {
  const slug = slugify(title);
  return { id: upsertComic(title, url, source, slug), slug };
}

export function saveMetadata(slug: string, metadata: ComicMetadata, referer?: string): void {
  const folder = path.join(CONFIG.OUTPUT_DIR, slug);
  utils.ensureFolderExists(folder);

  if (metadata.coverUrl) {
    downloadCover(metadata.coverUrl, folder, referer);
  }

  const file = path.join(folder, "metadata.json");
  const cleaned: any = {};
  for (const [k, v] of Object.entries(metadata)) {
    if (v !== undefined && (Array.isArray(v) ? v.length > 0 : v !== "")) {
      cleaned[k] = v;
    }
  }
  fs.writeFileSync(file, JSON.stringify(cleaned, null, 2));
}

async function downloadCover(coverUrl: string, folder: string, referer?: string) {
  try {
    const res = await axios.get(coverUrl, {
      responseType: "arraybuffer",
      timeout: 15000,
      headers: referer ? { Referer: referer } : {},
    });
    const ext = coverUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)?.[1] || "jpg";
    fs.writeFileSync(path.join(folder, `cover.${ext}`), Buffer.from(res.data));
  } catch {}
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
