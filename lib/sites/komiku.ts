import axios from "axios";
import * as cheerio from "cheerio";
import type { SiteScraper, ImageData, ChapterEntry, ComicMetadata } from "../core";

export const komikuScraper: SiteScraper = {
  name: "komiku",
  referer: "https://komiku.org/",

  match(url: string) {
    return url.includes("komiku.org");
  },

  async getMetadata(url: string): Promise<ComicMetadata> {
    try {
      const { data } = await axios.get(url);
      const $ = cheerio.load(data);

      const getTableVal = (label: string) => {
        const td = $("table.inftable td").filter((_, el) => $(el).text().trim() === label + ":");
        const val = td.next("td").text().trim();
        return val && val !== "-" ? val : undefined;
      };

      const listTableItems = (label: string) => {
        const td = $("table.inftable td").filter((_, el) => $(el).text().trim() === label + ":");
        return td.next("td").find("a, li")
          .map((_, el) => $(el).text().trim())
          .get()
          .filter(Boolean);
      };

      const coverUrl = $("img[src*='manga_thumbnail'], img[src*='thumbnail']").first().attr("src") || undefined;
      const title = $("table.inftable td")
        .filter((_, el) => $(el).text().trim() === "Judul:")
        .next("td")
        .text()
        .trim() || undefined;
      const alternativeName = getTableVal("Judul Alternatif");
      const typeText = getTableVal("Tipe");
      const statusText = getTableVal("Status");
      const rating = getTableVal("Rating");
      const readingDirection = getTableVal("Cara Baca");
      const totalViews = getTableVal("Pembaca");
      const author = listTableItems("Author").length ? listTableItems("Author") : (getTableVal("Author") ? [getTableVal("Author")!] : undefined);
      const genre = listTableItems("Genre");
      const theme = listTableItems("Tema").length ? listTableItems("Tema") : (getTableVal("Tema") ? [getTableVal("Tema")!] : undefined);
      const summary = $("p.desc[itemprop='description']").text().trim() || $('p[itemprop="description"]').text().trim() || undefined;

      return {
        ...(title && { title }),
        ...(alternativeName && { alternativeName }),
        ...(author && author.length && { author }),
        ...(genre.length && { genre }),
        ...(theme && theme.length && { theme }),
        ...(statusText && { status: statusText }),
        ...(typeText && { type: typeText }),
        ...(rating && { rating }),
        ...(readingDirection && { readingDirection }),
        ...(totalViews && { totalViews }),
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
      const titleFromTable = $("table.inftable td")
        .filter((_, el) => $(el).text().trim() === "Judul:")
        .next("td")
        .text()
        .trim();
      return titleFromTable || url.split("manga/")[1]?.split("/")[0] || "unknown";
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
