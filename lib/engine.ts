import {
  CONFIG,
  ImageProcessor,
  utils,
  type SiteScraper,
  type ChapterEntry,
  resolveComic,
  resolveChapter,
  isChapterAlreadyDone,
  finishChapter,
  saveMetadata,
  getComicHistory,
  getDownloadedChapters,
} from "./core";
import { komikuScraper } from "./sites/komiku";
import { mangatownScraper } from "./sites/mangatown";
import { mangapillScraper } from "./sites/mangapill";

const SCRAPERS: SiteScraper[] = [komikuScraper, mangatownScraper, mangapillScraper];

export function listScrapers(): SiteScraper[] {
  return SCRAPERS;
}

export function detectScraper(url: string): SiteScraper | null {
  return SCRAPERS.find((s) => s.match(url)) || null;
}

export interface ScrapeJob {
  id: string;
  url: string;
  status: "preparing" | "running" | "done" | "failed";
  title: string;
  source: string;
  totalChapters: number;
  currentChapterIndex: number;
  currentChapterLabel: string;
  currentImageIndex: number;
  totalImagesInChapter: number;
  okImages: number;
  failedImages: number;
  message: string;
  error?: string;
}

type JobCallback = (job: ScrapeJob) => void;

const jobs = new Map<string, ScrapeJob>();

export function getJob(id: string): ScrapeJob | undefined {
  return jobs.get(id);
}

export function getAllJobs(): ScrapeJob[] {
  return [...jobs.values()];
}

export async function scrape(
  url: string,
  count: number,
  startIndex: number,
  jobId: string,
  onChange: JobCallback
): Promise<void> {
  const scraper = detectScraper(url);
  if (!scraper) {
    const j = newJob(jobId, url, "failed");
    j.error = `No scraper for: ${new URL(url).hostname}`;
    onChange(j);
    return;
  }

  const j = newJob(jobId, url, "preparing");
  j.source = scraper.name;

  const comicTitle = await scraper.getComicTitle(url);
  const { id: comicId, slug } = resolveComic(comicTitle, url, scraper.name);
  const chapters = await scraper.listChapters(url);

  if (scraper.getMetadata) {
    const meta = await scraper.getMetadata(url);
    saveMetadata(slug, meta, scraper.referer);
  }

  j.title = comicTitle;
  j.totalChapters = chapters.length;
  j.status = "running";
  onChange(j);

  const end = Math.min(startIndex + count, chapters.length);
  for (let i = startIndex; i < end; i++) {
    j.currentChapterIndex = i;
    j.currentChapterLabel = chapters[i].label;
    onChange(j);
    await processChapter(chapters[i], slug, comicId, scraper, j, jobId, onChange);
  }

  j.status = "done";
  j.message = "Selesai";
  onChange(j);
}

async function processChapter(
  entry: ChapterEntry,
  slug: string,
  comicId: number,
  scraper: SiteScraper,
  job: ScrapeJob,
  jobId: string,
  onChange: JobCallback
): Promise<void> {
  const chapter = scraper.parseChapter(entry.url);

  if (isChapterAlreadyDone(comicId, chapter)) {
    job.message = `${entry.label} already complete`;
    onChange(job);
    return;
  }

  const images = await scraper.scrapeImages(entry.url);
  if (!images.length) {
    job.message = `No images found for ${entry.label}`;
    onChange(job);
    return;
  }

  const chapterId = resolveChapter(comicId, chapter, entry.url, images.length);

  let chapterOk = 0;
  let chapterFailed = 0;

  for (const [index, { src }] of images.entries()) {
    job.currentImageIndex = index;
    job.totalImagesInChapter = images.length;
    job.okImages = chapterOk;
    job.failedImages = chapterFailed;

    const ok = await ImageProcessor.processImage(
      src, index, slug, chapter,
      chapterId, scraper.referer,
      (msg) => { job.message = msg; onChange(job); }
    );

    if (ok) chapterOk++;
    else chapterFailed++;

    job.okImages = chapterOk;
    job.failedImages = chapterFailed;
    onChange(job);
  }

  finishChapter(chapterId, chapterOk + chapterFailed - chapterFailed, images.length);
}

function newJob(id: string, url: string, status: ScrapeJob["status"]): ScrapeJob {
  const j: ScrapeJob = {
    id,
    url,
    status,
    title: "",
    source: "",
    totalChapters: 0,
    currentChapterIndex: 0,
    currentChapterLabel: "",
    currentImageIndex: 0,
    totalImagesInChapter: 0,
    okImages: 0,
    failedImages: 0,
    message: "",
  };
  jobs.set(id, j);
  return j;
}

export { getComicHistory, getDownloadedChapters };
