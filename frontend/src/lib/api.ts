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

const baseUrl = window.location.origin;

export const api = {
  async komik(): Promise<{ slug: string; title: string }[]> {
    return fetch(`${baseUrl}/api/komik`).then(r => r.json());
  },
  cover(slug: string) {
    return `${baseUrl}/api/cover?judul=${encodeURIComponent(slug)}`;
  },
  async metadata(slug: string) {
    return fetch(`${baseUrl}/api/metadata?judul=${encodeURIComponent(slug)}`)
      .then(r => r.ok ? r.json() : null).catch(() => null);
  },
  async chapters(slug: string): Promise<string[]> {
    return fetch(`${baseUrl}/api/komik/${encodeURIComponent(slug)}`).then(r => r.json());
  },
  async images(slug: string, chapter: string): Promise<string[]> {
    return fetch(`${baseUrl}/api/komik/${encodeURIComponent(slug)}/${encodeURIComponent(chapter)}`).then(r => r.json());
  },
  async startScrape(url: string, startIndex = 0, count?: number): Promise<{ jobId: string }> {
    return fetch(`${baseUrl}/api/scrap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, startIndex, count: count ?? 99999 }),
    }).then(r => r.json());
  },
  async cancelJob(jobId: string) {
    return fetch(`${baseUrl}/api/jobs/${jobId}/cancel`, { method: "POST" }).then(r => r.json());
  },
  async getJobs(): Promise<ScrapeJob[]> {
    return fetch(`${baseUrl}/api/jobs`).then(r => r.json());
  },
  async checkUpdate(url: string) {
    return fetch(`${baseUrl}/api/scrap/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    }).then(r => r.json());
  },
};
