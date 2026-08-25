/**
 * PDFBox.online — local development server
 * ---------------------------------------
 * Serves the static site and proxies the conversion API endpoints
 * (/convert, /health) to the Python backend, so the frontend can always
 * call the same-origin /convert URL — exactly like production nginx does.
 *
 * Usage:
 *   node server.mjs
 *   (optional env) PORT=3000  BACKEND_URL=http://127.0.0.1:8000
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const BACKEND = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const PROXY_PATHS = new Set(["/convert", "/convert/", "/health"]);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".zip": "application/zip",
};

/** Forward an API request to the Python backend and stream the answer back. */
function proxyToBackend(req, res, targetPath) {
  const target = new URL(BACKEND + targetPath);
  const headers = { ...req.headers, host: target.host };
  const upstream = http.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      method: req.method,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );
  upstream.on("error", (err) => {
    console.error(`[dev-server] backend error (${err.message})`);
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
    }
    res.end(
      JSON.stringify({
        detail:
          "The conversion API is not reachable. Start it first: python -m uvicorn main:app --host 127.0.0.1 --port 8000",
      })
    );
  });
  req.pipe(upstream);
}

/** Serve a static file from this directory (no path traversal). */
function serveStatic(req, res, urlPath) {
  let filePath = path.normalize(path.join(__dirname, decodeURIComponent(urlPath)));
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error(`[dev-server] static error: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain" });
    }
    res.end("Internal server error");
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (PROXY_PATHS.has(url.pathname)) {
    proxyToBackend(req, res, url.pathname + (url.search || ""));
    return;
  }
  serveStatic(req, res, url.pathname === "/" ? "/index.html" : url.pathname);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[dev-server] static site  -> http://localhost:${PORT}`);
  console.log(`[dev-server] API proxy    -> ${BACKEND}  (/convert, /health)`);
});
