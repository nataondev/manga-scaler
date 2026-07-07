import axios from "axios";
import * as cheerio from "cheerio";
import type { SiteScraper, ImageData, ChapterEntry } from "../core";

const BASE = "https://www.mangatown.com";

export const mangatownScraper: SiteScraper = {
  name: "mangatown",
  referer: BASE + "/",

  match(url: string) {
    return url.includes("mangatown.com");
  },

  async getComicTitle(url: string): Promise<string> {
    try {
      const { data } = await axios.get(url);
      const $ = cheerio.load(data);
      return $("h1.title-top").text().trim() || url.split("/").slice(-2, -1)[0] || "unknown";
    } catch {
      return url.split("/").filter(Boolean).pop() || "unknown";
    }
  },

  async listChapters(url: string): Promise<ChapterEntry[]> {
    try {
      const { data } = await axios.get(url);
      const $ = cheerio.load(data);
      const entries: ChapterEntry[] = [];
      $("ul.chapter_list a, a[href*='/c0']").each((_, el) => {
        const href = $(el).attr("href") || "";
        if (/\/c\d+/.test(href)) {
          entries.push({
            url: href.startsWith("http") ? href : BASE + href,
            label: $(el).text().trim() || this.parseChapter(href),
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
      const { data: indexHtml } = await axios.get(url);
      const $index = cheerio.load(indexHtml);

      const pageCount = $index('select[onchange*="location.href"]').first().find('option')
        .filter((_, el) => /^\d+$/.test($index(el).text().trim()))
        .length;

      if (pageCount <= 1) {
        const src = $index("img#image").attr("src") || "";
        return src ? [{ src: src.startsWith("//") ? "https:" + src : src, alt: "" }] : [];
      }

      const result: ImageData[] = [];

      $index("img#image").each((_, el) => {
        let s = $index(el).attr("src") || "";
        if (s && s.startsWith("//")) s = "https:" + s;
        if (s) result.push({ src: s, alt: $index(el).attr("alt") || "" });
      });

      for (let p = 2; p <= pageCount; p++) {
        try {
          const pageUrl = url.replace(/\/$/, "") + `/${p}.html`;
          const { data: pageHtml } = await axios.get(pageUrl);
          const $page = cheerio.load(pageHtml);
          let src = $page("img#image").attr("src") || "";
          if (src && src.startsWith("//")) src = "https:" + src;
          if (src) result.push({ src, alt: $page("img#image").attr("alt") || "" });
        } catch {
          continue;
        }
      }

      return result;
    } catch {
      return [];
    }
  },

  parseChapter(url: string): string {
    const m = url.match(/\/c(\d+)/);
    return m ? parseInt(m[1]).toString() : "unknown";
  },
};
