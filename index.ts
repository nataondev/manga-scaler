#!/usr/bin/env bun

import { serve } from "bun";
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { CONFIG } from "./lib/core";
import { paths } from "./lib/paths";
import {
  detectScraper,
  scrape,
  getJob,
  getAllJobs,
  type ScrapeJob,
} from "./lib/engine";

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

  if (req.method === "GET" && path.startsWith("/api/jobs/")) {
    const jobId = path.split("/").pop()!;
    const job = getJob(jobId);
    if (!job) return withCORS(new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "Content-Type": "application/json" } }));
    return withCORS(new Response(JSON.stringify(job), { status: 200, headers: { "Content-Type": "application/json" } }));
  }

  // === Web Viewer ===
  if (path === "/") {
    const html = readFileSync(join(publicDir, "index.html"), "utf-8");
    return withCORS(new Response(html, { status: 200, headers: { "Content-Type": "text/html" } }));
  }

  if (path.startsWith("/public/")) {
    const subpath = path.slice("/public/".length);
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

serve({ fetch: handleRequest, port, hostname: "0.0.0.0" });

console.clear();
console.log(`📚 manga-scaler server`);
console.log(`   Viewer: http://localhost:${port}`);
console.log(`   API:    http://localhost:${port}/api`);
console.log(`   Config: ${paths.config}`);
console.log(`   Data:   ${paths.data}`);
console.log(`   Komik:  ${komikPath}`);
