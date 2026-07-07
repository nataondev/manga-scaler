import axios from "axios";
import * as cheerio from "cheerio";
import type { SiteScraper, ImageData, ChapterEntry } from "../core";

export const komikuScraper: SiteScraper = {
  name: "komiku",
  referer: "https://komiku.org/",

  match(url: string) {
    return url.includes("komiku.org");
  },

  async getComicTitle(url: string): Promise<string> {
    try {
      const { data } = await axios.get(url);
      const $ = cheerio.load(data);
      return $("h1.judul").text().trim() || url.split("manga/")[1]?.split("/")[0] || "unknown";
    } catch {
      return url.split("manga/")[1]?.split("/")[0] || "unknown";
    }
  },

  async listChapters(url: string): Promise<ChapterEntry[]> {
    try {
      const { data } = await axios.get(url);
      const $ = cheerio.load(data);
      const entries: ChapterEntry[] = [];
      $("td.judulseries a").each((_, el) => {
        const href = $(el).attr("href") || "";
        const text = $(el).text().trim();
        if (href) {
          entries.push({
            url: `https://komiku.org${href}`,
            label: text || this.parseChapter(href),
          });
        }
      });
      return entries.reverse();
    } catch {
      return [];
    }
  },

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
    } catch {
      return [];
    }
  },

  parseChapter(url: string): string {
    const raw = url.split("chapter-")[1]?.split("-bahasa-indonesia")[0]?.split("/")[0];
    const parts = raw?.split("-") || [];
    return parts.length > 2 ? parts[0] : raw || "unknown";
  },
};
