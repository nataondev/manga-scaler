import axios from "axios";
import * as cheerio from "cheerio";
import type { SiteScraper, ImageData, ChapterEntry, ComicMetadata } from "../core";

const BASE = "https://v1.westmanga.cc";

export const westmangaScraper: SiteScraper = {
  name: "westmanga",
  referer: BASE + "/",

  match(url: string) {
    return url.includes("westmanga.cc");
  },

  async getMetadata(url: string): Promise<ComicMetadata> {
    try {
      const { data } = await axios.get(url + "?_data=routes%2Fcomic.%24slug");
      const $ = cheerio.load(data);

      const coverUrl = $("img[alt='Comic Cover']").first().attr("src") || undefined;
      const title = $("[data-slot='card-title'].leading-none.font-semibold").first().text().trim() || undefined;
      const alternativeName = $("[data-slot='card-description']").first().text().trim() || undefined;
      const summary = $("p.text-muted-foreground.wrap-break-word")
        .first()
        .text()
        .trim() || undefined;

      const meta: Record<string, string> = {};
      $("table tbody tr").each((_, tr) => {
        const key = $(tr).find("td.font-bold").first().text().trim().replace(/:$/, "");
        const val = $(tr).find("td").last().text().trim();
        if (key && val && key !== "Posted By" && key !== "Posted On" && key !== "Updated On") {
          meta[key] = val;
        }
      });

      const genres: string[] = [];
      $("a[href*='contents?genre'] span[data-slot='badge']").each((_, el) => {
        const g = $(el).text().trim();
        if (g) genres.push(g);
      });

      return {
        ...(title && { title }),
        ...(alternativeName && alternativeName !== title && { alternativeName }),
        ...(genres.length && { genre: genres }),
        ...(meta["Status"] && { status: meta["Status"] }),
        ...(meta["Type"] && { type: meta["Type"] }),
        ...(meta["Released"] && meta["Released"] !== "N/A" && { year: meta["Released"] }),
        ...(meta["Author"] && { author: [meta["Author"]] }),
        ...(summary && { summary }),
        ...(coverUrl && { coverUrl }),
      };
    } catch {
      return {};
    }
  },

  async getComicTitle(url: string): Promise<string> {
    try {
      const { data } = await axios.get(url + "?_data=routes%2Fcomic.%24slug");
      const $ = cheerio.load(data);
      return $("[data-slot='card-title'].leading-none.font-semibold").first().text().trim()
        || url.split("comic/")[1]?.split("/")[0]?.replace(/-/g, " ")
        || "unknown";
    } catch {
      return url.split("comic/")[1]?.split("/")[0]?.replace(/-/g, " ") || "unknown";
    }
  },

  async listChapters(url: string): Promise<ChapterEntry[]> {
    try {
      const { data } = await axios.get(url + "?_data=routes%2Fcomic.%24slug");
      const $ = cheerio.load(data);
      const entries: ChapterEntry[] = [];
      $("a[href*='/view/']").each((_, el) => {
        const href = $(el).attr("href") || "";
        const text = $(el).find("p").first().text().trim();
        if (href && text) {
          entries.push({
            url: href.startsWith("http") ? href : BASE + href,
            label: text,
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
      const { data } = await axios.get(url + "?_data=routes%2Fview.%24slug");
      const $ = cheerio.load(data);
      return $("img[alt^='Page']")
        .map((_, el) => ({
          src: $(el).attr("src") || "",
          alt: $(el).attr("alt") || "",
        }))
        .get()
        .filter((img) => img.src);
    } catch {
      return [];
    }
  },

  parseChapter(url: string): string {
    const m = url.match(/chapter-(\d+[\d.]*)/);
    return m ? m[1] : "unknown";
  },
};
