import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, statSync } from "fs";
import { join } from "path";
import { exec } from "child_process";
import axios from "axios";
import sharp from "sharp";
import { paths } from "./paths";
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
  deleteChapter,
  getAllChapters,
} from "./db";
export { deleteChapter, getAllChapters };

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function loadEnvFile(filePath: string): Record<string, string> {
  try {
    const content = readFileSync(filePath, "utf-8");
    const env: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return env;
  } catch {
    return {};
  }
}

function loadConfig(): Record<string, string> {
  const layers: Record<string, string>[] = [];

  layers.push(loadEnvFile(join(paths.config, ".env")));

  const cwdEnv = loadEnvFile(".env");
  if (Object.keys(cwdEnv).length) layers.push(cwdEnv);

  layers.push(Object.fromEntries(
    Object.entries(process.env).filter(([k]) =>
      ["WAIFU2X_PATH", "OUTPUT_DIR", "MIN_IMAGE_WIDTH", "WEBP_QUALITY",
       "NOISE_REDUCTION", "SCALE_FACTOR", "WEB_SERVER_PORT"].includes(k)
    )
  ) as Record<string, string>);

  return Object.assign({}, ...layers);
}

const env = loadConfig();

export const CONFIG = {
  WAIFU2X_PATH: env.WAIFU2X_PATH || "~/Repos/tools/waifu2x/waifu2x-ncnn-vulkan",
  OUTPUT_DIR: env.OUTPUT_DIR || join(paths.data, "komik"),
  MIN_IMAGE_WIDTH: parseInt(env.MIN_IMAGE_WIDTH || "950"),
  WEBP_QUALITY: parseInt(env.WEBP_QUALITY || "85"),
  NOISE_REDUCTION: env.NOISE_REDUCTION || "2",
  SCALE_FACTOR: env.SCALE_FACTOR || "2",
  WEB_SERVER_PORT: parseInt(env.WEB_SERVER_PORT || "5000"),
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
    if (!existsSync(folderPath)) mkdirSync(folderPath, { recursive: true });
  },

  getImageSavePath(slug: string, chapter: string, fileName: string): string {
    const folderPath = join(CONFIG.OUTPUT_DIR, slug, chapter);
    this.ensureFolderExists(folderPath);
    return join(folderPath, fileName);
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
    const cmd = `${CONFIG.WAIFU2X_PATH} -i "${inputPath}" -o "${outputPath}" -f webp -n ${CONFIG.NOISE_REDUCTION} -s ${CONFIG.SCALE_FACTOR}`;
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

      writeFileSync(rawPath, new Uint8Array(buf));
      const rawSize = buf.length;
      const meta = await sharp(buf).metadata();
      const origWidth = meta.width || 0;

      if (origWidth > CONFIG.MIN_IMAGE_WIDTH) {
        message(`${index + 1} (${origWidth}px), direct WebP...`);
        unlinkSync(rawPath);
        await sharp(buf)
          .webp({ quality: CONFIG.WEBP_QUALITY })
          .toFile(outputPath);
      } else {
        message(`${index + 1} AI upscale → WebP (${origWidth}px)...`);
        await utils.waifu2x(rawPath, outputPath);
        unlinkSync(rawPath);
      }

      const outputSize = statSync(outputPath).size;
      markImageDone(chapterId, index + 1, outputFile, rawSize, outputSize);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`Error image ${index + 1}:`, msg);
      try { if (existsSync(rawPath)) unlinkSync(rawPath); } catch {}
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
  const folder = join(CONFIG.OUTPUT_DIR, slug);
  utils.ensureFolderExists(folder);

  if (metadata.coverUrl) {
    downloadCover(metadata.coverUrl, folder, referer);
  }

  const file = join(folder, "metadata.json");
  const cleaned: any = {};
  for (const [k, v] of Object.entries(metadata)) {
    if (v !== undefined && (Array.isArray(v) ? v.length > 0 : v !== "")) {
      cleaned[k] = v;
    }
  }
  writeFileSync(file, JSON.stringify(cleaned, null, 2));
}

async function downloadCover(coverUrl: string, folder: string, referer?: string) {
  try {
    const res = await axios.get(coverUrl, {
      responseType: "arraybuffer",
      timeout: 15000,
      headers: referer ? { Referer: referer } : {},
    });
    const ext = coverUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)?.[1] || "jpg";
    writeFileSync(join(folder, `cover.${ext}`), new Uint8Array(Buffer.from(res.data)));
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
