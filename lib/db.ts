import { Database } from "bun:sqlite";
import { join } from "path";
import { mkdirSync } from "fs";
import { paths } from "./paths";

const DB_DIR = join(paths.data, "data");
const DB_PATH = join(DB_DIR, "manga.db");

let db: Database;

export function getDb(): Database {
  if (!db) {
    mkdirSync(DB_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA foreign_keys = ON");
    initSchema();
  }
  return db;
}

function initSchema() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS comics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      url TEXT UNIQUE NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      last_accessed TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comic_id INTEGER NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
      chapter_num TEXT NOT NULL,
      chapter_url TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      total_images INTEGER DEFAULT 0,
      downloaded_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(comic_id, chapter_num)
    );

    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
      idx INTEGER NOT NULL,
      src TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      filename TEXT,
      raw_size INTEGER,
      output_size INTEGER,
      error TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_chapters_comic ON chapters(comic_id, chapter_num);
    CREATE INDEX IF NOT EXISTS idx_images_chapter ON images(chapter_id, idx);
  `);
}

// Comics
export function upsertComic(title: string, url: string, source: string, slug: string): number {
  const d = getDb();
  const existing = d.query("SELECT id FROM comics WHERE url = ?").get(url) as any;
  if (existing) {
    d.run("UPDATE comics SET title = ?, last_accessed = datetime('now') WHERE id = ?", [title, existing.id]);
    return existing.id;
  }
  const r = d.run("INSERT INTO comics (title, slug, url, source) VALUES (?, ?, ?, ?)", [title, slug, url, source]);
  return Number(r.lastInsertRowid);
}

export function getComicHistory(limit = 10) {
  return getDb().query(`
    SELECT * FROM comics ORDER BY last_accessed DESC LIMIT ?
  `).all(limit);
}

export function getComicById(id: number) {
  return getDb().query("SELECT * FROM comics WHERE id = ?").get(id);
}

export function getComicBySlug(slug: string) {
  return getDb().query("SELECT * FROM comics WHERE slug = ?").get(slug);
}

// Chapters
export function upsertChapter(comicId: number, chapterNum: string, chapterUrl: string, totalImages: number) {
  const d = getDb();
  const existing = d.query("SELECT id FROM chapters WHERE comic_id = ? AND chapter_num = ?").get(comicId, chapterNum) as any;
  if (existing) {
    d.run("UPDATE chapters SET total_images = ?, updated_at = datetime('now') WHERE id = ?", [totalImages, existing.id]);
    return existing.id;
  }
  const r = d.run(
    "INSERT INTO chapters (comic_id, chapter_num, chapter_url, total_images) VALUES (?, ?, ?, ?)",
    [comicId, chapterNum, chapterUrl, totalImages]
  );
  return Number(r.lastInsertRowid);
}

export function getDownloadedChapters(comicId: number) {
  return getDb().query(`
    SELECT chapter_num FROM chapters
    WHERE comic_id = ? AND status = 'complete'
    ORDER BY chapter_num
  `).all(comicId).map((r: any) => r.chapter_num) as string[];
}

export function isChapterComplete(comicId: number, chapterNum: string): boolean {
  const r = getDb().query(`
    SELECT status FROM chapters WHERE comic_id = ? AND chapter_num = ?
  `).get(comicId, chapterNum) as any;
  return r?.status === "complete";
}

export function markChapterComplete(chapterId: number, okCount: number, total: number) {
  getDb().run(
    "UPDATE chapters SET status = ?, downloaded_count = ?, updated_at = datetime('now') WHERE id = ?",
    [okCount >= total ? "complete" : "partial", okCount, chapterId]
  );
}

// Images
export function upsertImage(chapterId: number, idx: number, src: string) {
  const d = getDb();
  d.run(
    "INSERT OR IGNORE INTO images (chapter_id, idx, src) VALUES (?, ?, ?)",
    [chapterId, idx, src]
  );
}

export function markImageDone(
  chapterId: number,
  idx: number,
  filename: string,
  rawSize: number,
  outputSize: number
) {
  getDb().run(
    `UPDATE images SET status = 'complete', filename = ?, raw_size = ?, output_size = ?
     WHERE chapter_id = ? AND idx = ?`,
    [filename, rawSize, outputSize, chapterId, idx]
  );
}

export function markImageSkip(
  chapterId: number,
  idx: number,
  filename: string,
  size: number
) {
  getDb().run(
    `UPDATE images SET status = 'skip', filename = ?, output_size = ?
     WHERE chapter_id = ? AND idx = ?`,
    [filename, size, chapterId, idx]
  );
}

export function markImageFailed(chapterId: number, idx: number, error: string) {
  getDb().run(
    "UPDATE images SET status = 'failed', error = ? WHERE chapter_id = ? AND idx = ?",
    [error, chapterId, idx]
  );
}

export function getChapterImages(chapterId: number) {
  return getDb().query(
    "SELECT idx, src FROM images WHERE chapter_id = ? AND status != 'failed' ORDER BY idx"
  ).all(chapterId) as { idx: number; src: string }[];
}

export function deleteChapter(comicId: number, chapterNum: string): boolean {
  const d = getDb();
  const chapter = d.query("SELECT id FROM chapters WHERE comic_id = ? AND chapter_num = ?").get(comicId, chapterNum) as any;
  if (!chapter) return false;
  d.run("DELETE FROM images WHERE chapter_id = ?", [chapter.id]);
  d.run("DELETE FROM chapters WHERE id = ?", [chapter.id]);
  return true;
}

export function getAllChapters(comicId: number) {
  return getDb().query("SELECT chapter_num, chapter_url, status FROM chapters WHERE comic_id = ? ORDER BY chapter_num").all(comicId) as { chapter_num: string; chapter_url: string; status: string }[];
}
