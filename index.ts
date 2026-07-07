import { serve } from "bun";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import dotenv from "dotenv";

dotenv.config();

const { WEB_SERVER_PORT = "3000" } = process.env;

const komikPath = "./komik";

// Helper untuk menambahkan header CORS
function withCORS(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(response.body, {
    ...response,
    headers,
  });
}

// Endpoint handler
function handleRequest(req: Request): Response {
  const url = new URL(req.url);
  const path = url.pathname;

  // Handle preflight request
  if (req.method === "OPTIONS") {
    return withCORS(new Response(null, { status: 204 }));
  }

  if (path === "/") {
    const html = readFileSync("./public/index.html", "utf-8");
    return withCORS(
      new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    );
  }

  // Serve static files
  if (path.startsWith("/public/")) {
    const filePath = `.${path}`;
    try {
      const fileContent = readFileSync(filePath);
      const contentType = path.endsWith(".css")
        ? "text/css"
        : path.endsWith(".js")
        ? "application/javascript"
        : "text/plain";
      return withCORS(
        new Response(fileContent, {
          status: 200,
          headers: { "Content-Type": contentType },
        })
      );
    } catch {
      return withCORS(new Response("File not found", { status: 404 }));
    }
  }

  if (path === "/api/komik") {
    const dirs = readdirSync(komikPath).filter((dir) => {
      return statSync(join(komikPath, dir)).isDirectory();
    });
    const list = dirs.map((slug) => {
      let title = slug;
      try {
        const meta = JSON.parse(readFileSync(join(komikPath, slug, "metadata.json"), "utf-8"));
        title = meta.title || meta.alternativeName || slug;
      } catch {}
      return { slug, title };
    });
    return withCORS(
      new Response(JSON.stringify(list), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  }

  if (path === "/api/cover") {
    const judul = url.searchParams.get("judul");
    if (!judul) {
      return withCORS(new Response("Judul not specified", { status: 400 }));
    }
    const judulPath = join(komikPath, judul);
    try {
      // Cek cover file khusus dulu
      const coverFiles = readdirSync(judulPath)
        .filter((f) => f.match(/^cover\.(png|jpg|jpeg|gif|webp)$/));
      if (coverFiles.length > 0) {
        const file = Bun.file(join(judulPath, coverFiles[0]));
        return withCORS(new Response(file, { status: 200 }));
      }
      // Fallback: halaman pertama chapter pertama
      const chapters = readdirSync(judulPath)
        .filter((dir) => statSync(join(judulPath, dir)).isDirectory())
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      for (const chapter of chapters) {
        const chapterPath = join(judulPath, chapter);
        const images = readdirSync(chapterPath)
          .filter((f) => f.match(/\.(png|jpg|jpeg|gif|webp)$/))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        if (images.length > 0) {
          const firstImage = join(chapterPath, images[0]);
          const file = Bun.file(firstImage);
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
    if (!judul) {
      return withCORS(new Response("Judul not specified", { status: 400 }));
    }
    try {
      const metaPath = join(komikPath, judul, "metadata.json");
      const meta = readFileSync(metaPath, "utf-8");
      return withCORS(
        new Response(meta, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    } catch {
      return withCORS(new Response("Metadata not found", { status: 404 }));
    }
  }

  if (path.startsWith("/api/komik")) {
    const parts = path.split("/").filter((p) => p); // Split path
    const judul = parts[2];
    const chapter = parts[3];

    if (!judul) {
      return withCORS(new Response("Judul not specified", { status: 400 }));
    }

    const judulPath = join(komikPath, judul);

    if (!chapter) {
      try {
        const chapters = readdirSync(judulPath)
          .filter((dir) => statSync(join(judulPath, dir)).isDirectory())
          .sort((a, b) => {
            // Mengurutkan berdasarkan chapter dengan mempertimbangkan angka
            return a.localeCompare(b, undefined, { numeric: true });
          });
        return withCORS(
          new Response(JSON.stringify(chapters), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      } catch {
        return withCORS(new Response("Judul not found", { status: 404 }));
      }
    }

    const chapterPath = join(judulPath, chapter);
    try {
      const images = readdirSync(chapterPath)
        .filter((file) => file.match(/\.(png|jpg|jpeg|gif|webp)$/))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const imagePaths = images.map(
        (file) =>
          `/api/image?path=${encodeURIComponent(join(chapterPath, file))}`
      );
      return withCORS(
        new Response(JSON.stringify(imagePaths), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    } catch {
      return withCORS(new Response("Chapter not found", { status: 404 }));
    }
  }

  if (path.startsWith("/api/image")) {
    const filePath = url.searchParams.get("path");

    if (!filePath) {
      return withCORS(new Response("File path not specified", { status: 400 }));
    }

    const resolved = join(__dirname, filePath);
    if (!resolved.startsWith(join(__dirname, komikPath))) {
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

// Start the server
serve({
  fetch: handleRequest,
  port: parseInt(WEB_SERVER_PORT),
  hostname: "0.0.0.0",
});

console.clear();
console.log(`Server started at http://localhost:${WEB_SERVER_PORT}`);
