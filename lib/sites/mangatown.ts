import axios from "axios";
import * as cheerio from "cheerio";
import type { SiteScraper, ImageData, ChapterEntry, ComicMetadata } from "../core";

const BASE = "https://www.mangatown.com";

export const mangatownScraper: SiteScraper = {
  name: "mangatown",
  referer: BASE + "/",

  match(url: string) {
    return url.includes("mangatown.com");
  },

  async getMetadata(url: string): Promise<ComicMetadata> {
    try {
      const { data } = await axios.get(url);
      const $ = cheerio.load(data);

      const coverUrl = $("img.cover, .detail_info img").first().attr("src") || undefined;
      const title = $("h1.title-top").text().trim() || undefined;
      const summary = $("#show[style*='display: inline']").text().trim() || undefined;

      // Parse all <li> in detail_info by matching <b> label text
      const meta: Record<string, string | string[]> = {};
      $(".detail_info li").each((_, li) => {
        const b = $(li).find("b").first();
        if (!b.length) return;
        const label = b.text().trim().replace(/:$/, "");
        b.remove();
        const aLinks = $(li).find("a").map((_, a) => $(a).text().trim()).get().filter(Boolean);
        if (aLinks.length) {
          meta[label] = aLinks;
        } else {
          const val = $(li).text().trim();
          if (val) meta[label] = val;
        }
      });

      return {
        ...(title && { title }),
        ...(meta["Alternative Name"] && { alternativeName: meta["Alternative Name"] as string }),
        ...(meta["Author(s)"] || meta["Author"] ? { author: (meta["Author(s)"] || meta["Author"]) as string[] } : {}),
        ...(meta["Artist(s)"] || meta["Artist"] ? { artist: (meta["Artist(s)"] || meta["Artist"]) as string[] } : {}),
        ...(meta["Genre(s)"] || meta["Genre"] ? { genre: (meta["Genre(s)"] || meta["Genre"]) as string[] } : {}),
        ...(meta["Status(s)"] || meta["Status"] ? { status: (meta["Status(s)"] || meta["Status"]) as string } : {}),
        ...(meta["Type"] && { type: meta["Type"] as string }),
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
