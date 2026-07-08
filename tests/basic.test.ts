import { describe, it, expect } from "bun:test";
import { platform } from "os";
import { existsSync } from "fs";

// paths
import { paths } from "../lib/paths";

describe("paths", () => {
  const p = platform();

  it("config dir sesuai OS", () => {
    if (p === "darwin") expect(paths.config).toContain("Library/Application Support");
    else if (p === "win32") expect(paths.config).toContain("AppData");
    else expect(paths.config).toContain(".config");
    expect(paths.config).toContain("manga-scaler");
  });

  it("data dir sesuai OS", () => {
    if (p === "darwin") expect(paths.data).toContain("Library/Application Support");
    else if (p === "win32") expect(paths.data).toContain("AppData");
    else expect(paths.data).toContain(".local/share");
    expect(paths.data).toContain("manga-scaler");
  });

  it("cache dir sesuai OS", () => {
    if (p === "darwin") expect(paths.cache).toContain("Library/Caches");
    else if (p === "win32") expect(paths.cache).toContain("Cache");
    else expect(paths.cache).toContain(".cache");
    expect(paths.cache).toContain("manga-scaler");
  });
});

// core
import { utils, CONFIG, slugify, resolveComic } from "../lib/core";

describe("core", () => {
  it("slugify normal", () => {
    expect(slugify("One Piece!!")).toBe("one-piece");
    expect(slugify("Manga (2024)")).toBe("manga-2024");
    expect(slugify("- Test -")).toBe("test");
  });

  it("slugify edge cases", () => {
    expect(slugify("")).toBe("");
    expect(slugify("???")).toBe("");
  });

  it("CONFIG punya semua key", () => {
    const keys = ["WAIFU2X_PATH", "OUTPUT_DIR", "MIN_IMAGE_WIDTH", "WEBP_QUALITY", "NOISE_REDUCTION", "SCALE_FACTOR", "WEB_SERVER_PORT"];
    for (const k of keys) expect(CONFIG).toHaveProperty(k);
  });

  it("CONFIG OUTPUT_DIR absolute path", () => {
    expect(CONFIG.OUTPUT_DIR).toMatch(/^\//);
  });

  it("utils.ensureFolderExists bikin folder", () => {
    const testPath = `/tmp/ms-test-${Date.now()}/sub/sub`;
    utils.ensureFolderExists(testPath);
    expect(existsSync(testPath)).toBe(true);
  });

  it("utils.getImageSavePath", () => {
    const p = utils.getImageSavePath("one-piece", "ch01", "test.webp");
    expect(p).toContain("one-piece/ch01/test.webp");
    expect(p.startsWith(CONFIG.OUTPUT_DIR)).toBe(true);
  });

  it("utils.retry retries on failure", async () => {
    let count = 0;
    const fn = async () => {
      count++;
      if (count < 3) throw new Error("fail");
      return "ok";
    };
    const result = await utils.retry(fn, 3);
    expect(result).toBe("ok");
    expect(count).toBe(3);
  });

  it("utils.retry fails after max retries", async () => {
    let count = 0;
    const fn = async () => {
      count++;
      throw new Error("always fail");
    };
    await expect(utils.retry(fn, 2)).rejects.toThrow("Failed after 2 attempts");
    expect(count).toBe(2);
  });

  it("resolveComic", () => {
    const { id, slug } = resolveComic("One Piece!!", "https://komiku.org/one-piece", "komiku");
    expect(slug).toBe("one-piece");
    expect(typeof id).toBe("number");
  });
});

// engine
import { detectScraper, listScrapers } from "../lib/engine";

describe("engine", () => {
  it("listScrapers returns all", () => {
    const s = listScrapers();
    expect(s.length).toBeGreaterThanOrEqual(3);
    const names = s.map(x => x.name);
    expect(names).toContain("komiku");
    expect(names).toContain("mangatown");
    expect(names).toContain("mangapill");
  });

  it("detectScraper komiku", () => {
    expect(detectScraper("https://komiku.org/manga/test/")?.name).toBe("komiku");
  });

  it("detectScraper mangatown", () => {
    expect(detectScraper("https://www.mangatown.com/manga/test/")?.name).toBe("mangatown");
  });

  it("detectScraper mangapill", () => {
    expect(detectScraper("https://mangapill.com/manga/test")?.name).toBe("mangapill");
  });

  it("detectScraper unknown returns null", () => {
    expect(detectScraper("https://google.com")).toBeNull();
  });
});

// db
import { getDb, upsertComic, getComicHistory, getDownloadedChapters, upsertChapter, isChapterComplete, markChapterComplete } from "../lib/db";

describe("db", () => {
  const now = Date.now();
  const testSlug = `test-${now}`;
  const testUrl = `https://test.com/manga-${now}`;

  it("getDb returns instance", () => {
    expect(getDb()).toBeDefined();
  });

  it("upsertComic insert lalu update", () => {
    const id1 = upsertComic("Test Comic", testUrl, "test", testSlug);
    expect(typeof id1).toBe("number");
    const id2 = upsertComic("Test Comic Updated", testUrl, "test", testSlug);
    expect(id2).toBe(id1);
  });

  it("getComicHistory returns entries", () => {
    const hist = getComicHistory(100) as any[];
    expect(hist.some((h: any) => h.slug === testSlug)).toBe(true);
  });

  it("upsertChapter dan isChapterComplete", () => {
    const db = getDb();
    const comic = db.query("SELECT id FROM comics WHERE slug = ?").get(testSlug) as any;
    const chId = upsertChapter(comic.id, "1", "https://test.com/ch1", 5);
    expect(isChapterComplete(comic.id, "1")).toBe(false);
    markChapterComplete(chId, 5, 5);
    expect(isChapterComplete(comic.id, "1")).toBe(true);
  });

  it("getDownloadedChapters", () => {
    const db = getDb();
    const comic = db.query("SELECT id FROM comics WHERE slug = ?").get(testSlug) as any;
    expect(getDownloadedChapters(comic.id)).toContain("1");
  });
});
