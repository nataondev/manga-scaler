import axios from "axios";
import * as cheerio from "cheerio";
import type { SiteScraper, ImageData, ChapterEntry, ComicMetadata } from "../core";

const BASE = "https://mangapill.com";

export const mangapillScraper: SiteScraper = {
  name: "mangapill",
  referer: BASE + "/",

  match(url: string) {
    return url.includes("mangapill.com");
  },

  async getMetadata(url: string): Promise<ComicMetadata> {
    try {
      const { data } = await axios.get(url);
      const $ = cheerio.load(data);

      const coverUrl = $("img.lazy").first().attr("src") || $("img.lazy").first().attr("data-src") || undefined;
      const title = $("h1.font-bold").first().text().trim() || undefined;
      const alternativeName = title
        ? $(".text-sm.text-secondary, [class*='text--secondary']").first().text().trim() || undefined
        : undefined;

      const summary =
        $("p.text-sm")
          .filter((_, el) => $(el).text().trim().length > 50)
          .first()
          .text()
          .trim() || undefined;

      const meta: Record<string, string> = {};
      $(".grid.grid-cols-1.md\\:grid-cols-3.gap-3.mb-3 > div").each((_, div) => {
        const label = $(div).find("label").text().trim();
        const value = $(div).find("div").last().text().trim();
        if (label && value) meta[label] = value;
      });

      const genres: string[] = [];
      $(".mb-3").each((_, el) => {
        if ($(el).find("label").text().trim() === "Genres") {
          $(el)
            .find("a.text-brand")
            .each((_, a) => genres.push($(a).text().trim()));
        }
      });

      return {
        ...(title && { title }),
        ...(alternativeName && { alternativeName }),
        ...(genres.length && { genre: genres }),
        ...(meta["Type"] && { type: meta["Type"] }),
        ...(meta["Status"] && { status: meta["Status"] }),
        ...(meta["Year"] && { year: meta["Year"] }),
        ...(summary && { summary }),
        ...(coverUrl && { coverUrl }),
      };
    } catch {
      return {};
    }
  },

  async getComicTitle(url: string): Promise<string> {
    try {
      const { data } = await axios.get(url);
      const $ = cheerio.load(data);
      return $("h1.font-bold").first().text().trim() || url.split("/").filter(Boolean).pop() || "unknown";
    } catch {
      return url.split("/").filter(Boolean).pop() || "unknown";
    }
  },

  async listChapters(url: string): Promise<ChapterEntry[]> {
    try {
      const { data } = await axios.get(url);
      const $ = cheerio.load(data);
      const entries: ChapterEntry[] = [];
      $("#chapters a[href*='/chapters/']").each((_, el) => {
        const href = $(el).attr("href") || "";
        const text = $(el).text().trim();
        if (href) {
          entries.push({
            url: href.startsWith("http") ? href : BASE + href,
            label: text || this.parseChapter(href),
          });
        }
      });
      return entries;
    } catch {
      return [];
    }
  },

  async scrapeImages(url: string): Promise<ImageData[]> {
    try {
      const { data } = await axios.get(url);
      const $ = cheerio.load(data);
      return $("img.js-page")
        .map((_, el) => ({
          src: $(el).attr("src") || $(el).attr("data-src") || "",
          alt: $(el).attr("alt") || "",
        }))
        .get()
        .filter((img) => img.src);
    } catch {
      return [];
    }
  },

  parseChapter(url: string): string {
    const m = url.match(/chapter-(\d+)/);
    return m ? m[1] : "unknown";
  },
};
