#!/usr/bin/env bun

import { serve } from "bun";
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { CONFIG } from "./lib/core";
import { paths } from "./lib/paths";
import {
  detectScraper,
  scrape,
  getJob,
  getAllJobs,
  cancelJob,
  subscribeSSE,
  type ScrapeJob,
} from "./lib/engine";
import { getDownloadedChapters, slugify, saveMetadata, deleteChapter, getAllChapters } from "./lib/core";
import { getComicBySlug } from "./lib/db";

mkdirSync(paths.config, { recursive: true });
const envFile = join(paths.config, ".env");
if (!existsSync(envFile)) {
  writeFileSync(envFile, [
    `WEB_SERVER_PORT=5000`,
    `WAIFU2X_PATH=~/Repos/tools/waifu2x/waifu2x-ncnn-vulkan`,
    `MIN_IMAGE_WIDTH=900`,
    `WEBP_QUALITY=85`,
    `NOISE_REDUCTION=2`,
    `SCALE_FACTOR=2`,
    "",
  ].join("\n"));
}

const port = CONFIG.WEB_SERVER_PORT;
const komikPath = CONFIG.OUTPUT_DIR;
const localKomikPath = join(import.meta.dir, "komik");
const publicDir = join(import.meta.dir, "public");

existsSync(komikPath) || mkdirSync(komikPath, { recursive: true });

function withCORS(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(response.body, { ...response, headers });
}

function serveStatic(subpath: string, contentType: string): Response {
  try {
    const content = readFileSync(join(publicDir, subpath));
    return withCORS(new Response(content, { status: 200, headers: { "Content-Type": contentType } }));
  } catch {
    return withCORS(new Response("Not found", { status: 404 }));
  }
}

function listKomik() {
  const slugs = new Map<string, string>();

  for (const base of [komikPath, localKomikPath]) {
    if (!existsSync(base)) continue;
    try {
      for (const dir of readdirSync(base)) {
        const full = join(base, dir);
        if (!statSync(full).isDirectory()) continue;
        if (!slugs.has(dir)) slugs.set(dir, full);
      }
    } catch {}
  }

  return [...slugs.entries()].map(([slug, dirPath]) => {
    let title = slug;
    try {
      const meta = JSON.parse(readFileSync(join(dirPath, "metadata.json"), "utf-8"));
      title = meta.title || meta.alternativeName || slug;
    } catch {}
    return { slug, title };
  });
}

function resolveJudulPath(judul: string): string | null {
  for (const base of [komikPath, localKomikPath]) {
    const p = join(base, judul);
    if (existsSync(p) && statSync(p).isDirectory()) return p;
  }
  return null;
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    return withCORS(new Response(null, { status: 204 }));
  }

  // === Scrap API ===
  if (req.method === "POST" && path === "/api/scrap") {
    try {
      const body: { url: string; startIndex?: number; count?: number } = await req.json();
      if (!body.url) return withCORS(new Response(JSON.stringify({ error: "url required" }), { status: 400, headers: { "Content-Type": "application/json" } }));

      const scraper = detectScraper(body.url);
      if (!scraper) return withCORS(new Response(JSON.stringify({ error: `No scraper for ${new URL(body.url).hostname}` }), { status: 400, headers: { "Content-Type": "application/json" } }));

      const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      scrape(body.url, body.count ?? Infinity, body.startIndex ?? 0, jobId, () => {});

      return withCORS(new Response(JSON.stringify({ jobId }), { status: 202, headers: { "Content-Type": "application/json" } }));
    } catch {
      return withCORS(new Response(JSON.stringify({ error: "invalid body" }), { status: 400, headers: { "Content-Type": "application/json" } }));
    }
  }

  if (req.method === "GET" && path === "/api/jobs") {
    return withCORS(new Response(JSON.stringify(getAllJobs()), { status: 200, headers: { "Content-Type": "application/json" } }));
  }

  if (req.method === "GET" && path === "/api/jobs/events") {
    const stream = new ReadableStream({
      start(controller) {
        // kirim semua job saat ini sebagai initial state
        for (const job of getAllJobs()) {
          controller.enqueue(`data: ${JSON.stringify(job)}\n\n`);
        }
        // heartbeat tiap 15s biar gak idle timeout
        const ping = setInterval(() => {
          controller.enqueue(": keepalive\n\n");
        }, 15000);
        const unsub = subscribeSSE((job) => {
          controller.enqueue(`data: ${JSON.stringify(job)}\n\n`);
        });
        req.signal.addEventListener("abort", () => {
          clearInterval(ping);
          unsub();
        });
      },
    });
    return withCORS(new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
    }));
  }

  if (req.method === "POST" && path.match(/^\/api\/jobs\/[^/]+\/cancel$/)) {
    const jobId = path.split("/")[3];
    const ok = cancelJob(jobId);
    const status = ok ? 200 : 404;
    return withCORS(new Response(JSON.stringify({ cancelled: ok }), { status, headers: { "Content-Type": "application/json" } }));
  }

  if (req.method === "GET" && path.startsWith("/api/jobs/") && !path.endsWith("/cancel")) {
    const jobId = path.split("/").pop()!;
    const job = getJob(jobId);
    if (!job) return withCORS(new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "Content-Type": "application/json" } }));
    return withCORS(new Response(JSON.stringify(job), { status: 200, headers: { "Content-Type": "application/json" } }));
  }

  if (req.method === "POST" && path === "/api/scrap/check") {
    try {
      const body: { url: string } = await req.json();
      if (!body.url) return withCORS(new Response(JSON.stringify({ error: "url required" }), { status: 400, headers: { "Content-Type": "application/json" } }));

      const scraper = detectScraper(body.url);
      if (!scraper) return withCORS(new Response(JSON.stringify({ error: `No scraper for ${new URL(body.url).hostname}` }), { status: 400, headers: { "Content-Type": "application/json" } }));

      const comicTitle = await scraper.getComicTitle(body.url);
      const realSlug = slugify(comicTitle);
      const comic = getComicBySlug(realSlug) as any;
      const chapters = await scraper.listChapters(body.url);

      if (!comic) {
        return withCORS(new Response(JSON.stringify({ newChapters: chapters, total: chapters.length }), { status: 200, headers: { "Content-Type": "application/json" } }));
      }

      const downloaded = getDownloadedChapters(comic.id);
      const downloadedSet = new Set(downloaded.map(String));
      const newChapters = chapters.filter(c => !downloadedSet.has(scraper.parseChapter(c.url)));

      const allChapters = chapters.map(c => ({
        label: c.label,
        url: c.url,
        chapter_num: scraper.parseChapter(c.url),
        downloaded: downloadedSet.has(scraper.parseChapter(c.url)),
      }));

      if (scraper.getMetadata) {
        const meta = await scraper.getMetadata(body.url);
        saveMetadata(realSlug, meta, scraper.referer);
      }

      return withCORS(new Response(JSON.stringify({
        url: body.url,
        total: chapters.length,
        downloaded: downloaded.length,
        newChapters: newChapters.map(c => ({ label: c.label, url: c.url })),
        allChapters,
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    } catch (e) {
      return withCORS(new Response(JSON.stringify({ error: e instanceof Error ? e.message : "check failed" }), { status: 500, headers: { "Content-Type": "application/json" } }));
    }
  }

  if (req.method === "GET" && path.startsWith("/api/comic/") && path.endsWith("/meta")) {
    const slug = path.split("/")[3];
    const comic = getComicBySlug(slug) as any;
    if (!comic) return withCORS(new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "Content-Type": "application/json" } }));
    return withCORS(new Response(JSON.stringify({ url: comic.url, source: comic.source, title: comic.title }), { status: 200, headers: { "Content-Type": "application/json" } }));
  }

  if (req.method === "GET" && path.startsWith("/api/comic/") && path.endsWith("/chapters")) {
    const slug = path.split("/")[3];
    const comic = getComicBySlug(slug) as any;
    if (!comic) return withCORS(new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "Content-Type": "application/json" } }));
    const chaps = getAllChapters(comic.id);
    return withCORS(new Response(JSON.stringify(chaps), { status: 200, headers: { "Content-Type": "application/json" } }));
  }

  if (req.method === "DELETE" && path.startsWith("/api/comic/") && path.endsWith("/chapter")) {
    const slug = path.split("/")[3];
    const chapterNum = url.searchParams.get("chapter");
    if (!chapterNum) return withCORS(new Response(JSON.stringify({ error: "chapter required" }), { status: 400, headers: { "Content-Type": "application/json" } }));
    const comic = getComicBySlug(slug) as any;
    if (!comic) return withCORS(new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "Content-Type": "application/json" } }));
    const ok = deleteChapter(comic.id, chapterNum);
    if (ok) {
      const chapDir = join(CONFIG.OUTPUT_DIR, slug, chapterNum);
      try { rmSync(chapDir, { recursive: true, force: true }); } catch {}
    }
    return withCORS(new Response(JSON.stringify({ deleted: ok }), { status: ok ? 200 : 404, headers: { "Content-Type": "application/json" } }));
  }

  // === Web Viewer ===
  if (path === "/") {
    const html = readFileSync(join(publicDir, "index.html"), "utf-8");
    return withCORS(new Response(html, { status: 200, headers: { "Content-Type": "text/html" } }));
  }

  if (path.startsWith("/public/") || path.startsWith("/assets/")) {
    const subpath = path.startsWith("/public/") ? path.slice("/public/".length) : path.slice(1);
    const contentType = subpath.endsWith(".css") ? "text/css"
      : subpath.endsWith(".js") ? "application/javascript"
      : subpath.endsWith(".png") ? "image/png"
      : "text/plain";
    return serveStatic(subpath, contentType);
  }

  if (path === "/api/komik") {
    return withCORS(new Response(JSON.stringify(listKomik()), { status: 200, headers: { "Content-Type": "application/json" } }));
  }

  if (path === "/api/cover") {
    const judul = url.searchParams.get("judul");
    if (!judul) return withCORS(new Response("Judul not specified", { status: 400 }));
    const judulPath = resolveJudulPath(judul);
    if (!judulPath) return withCORS(new Response("Judul not found", { status: 404 }));
    try {
      const coverFiles = readdirSync(judulPath).filter((f) => f.match(/^cover\.(png|jpg|jpeg|gif|webp)$/));
      if (coverFiles.length > 0) {
        const file = Bun.file(join(judulPath, coverFiles[0]));
        return withCORS(new Response(file, { status: 200 }));
      }
      const chapters = readdirSync(judulPath)
        .filter((dir) => statSync(join(judulPath, dir)).isDirectory())
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      for (const chapter of chapters) {
        const chapterPath = join(judulPath, chapter);
        const images = readdirSync(chapterPath)
          .filter((f) => f.match(/\.(png|jpg|jpeg|gif|webp)$/))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        if (images.length > 0) {
          const file = Bun.file(join(chapterPath, images[0]));
          return withCORS(new Response(file, { status: 200 }));
        }
      }
      return withCORS(new Response("No cover found", { status: 404 }));
    } catch {
      return withCORS(new Response("Judul not found", { status: 404 }));
    }
  }

  if (path === "/api/metadata") {
    const judul = url.searchParams.get("judul");
    if (!judul) return withCORS(new Response("Judul not specified", { status: 400 }));
    const judulPath = resolveJudulPath(judul);
    if (!judulPath) return withCORS(new Response("Metadata not found", { status: 404 }));
    try {
      const metaPath = join(judulPath, "metadata.json");
      const meta = readFileSync(metaPath, "utf-8");
      return withCORS(new Response(meta, { status: 200, headers: { "Content-Type": "application/json" } }));
    } catch {
      return withCORS(new Response("Metadata not found", { status: 404 }));
    }
  }

  if (path.startsWith("/api/komik/")) {
    const parts = path.split("/").filter((p) => p);
    const judul = parts[2];
    const chapter = parts[3];

    if (!judul) return withCORS(new Response("Judul not specified", { status: 400 }));
    const judulPath = resolveJudulPath(judul);
    if (!judulPath) return withCORS(new Response("Judul not found", { status: 404 }));

    if (!chapter) {
      try {
        const chapters = readdirSync(judulPath)
          .filter((dir) => statSync(join(judulPath, dir)).isDirectory())
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        return withCORS(new Response(JSON.stringify(chapters), { status: 200, headers: { "Content-Type": "application/json" } }));
      } catch {
        return withCORS(new Response("Judul not found", { status: 404 }));
      }
    }

    const chapterPath = join(judulPath, chapter);
    try {
      const images = readdirSync(chapterPath)
        .filter((f) => f.match(/\.(png|jpg|jpeg|gif|webp)$/))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const imagePaths = images.map(
        (file) => `/api/image?path=${encodeURIComponent(join(chapterPath, file))}`
      );
      return withCORS(new Response(JSON.stringify(imagePaths), { status: 200, headers: { "Content-Type": "application/json" } }));
    } catch {
      return withCORS(new Response("Chapter not found", { status: 404 }));
    }
  }

  if (path.startsWith("/api/image")) {
    const filePath = url.searchParams.get("path");
    if (!filePath) return withCORS(new Response("File path not specified", { status: 400 }));
    const resolved = join("/", filePath);
    const allowed = [komikPath, localKomikPath].some(b => resolved.startsWith(b));
    if (!allowed) {
      return withCORS(new Response("Access denied", { status: 403 }));
    }
    try {
      const file = Bun.file(resolved);
      return withCORS(new Response(file, { status: 200 }));
    } catch {
      return withCORS(new Response("File not found", { status: 404 }));
    }
  }

  return withCORS(new Response("Not Found", { status: 404 }));
}

serve({ fetch: handleRequest, port, hostname: "0.0.0.0", idleTimeout: 255 });

console.clear();
console.log(`📚 manga-scaler server`);
console.log(`   Viewer: http://localhost:${port}`);
console.log(`   API:    http://localhost:${port}/api`);
console.log(`   Config: ${paths.config}`);
console.log(`   Data:   ${paths.data}`);
console.log(`   Komik:  ${komikPath}`);
