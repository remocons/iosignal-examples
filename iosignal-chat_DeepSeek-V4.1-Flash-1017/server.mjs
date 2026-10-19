import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Server } from 'iosignal';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const VENDOR_IO = path.join(__dirname, 'node_modules/iosignal/dist/browser/iife/io.js');
const PORT = Number(process.env.PORT || 5177);
const WS_PATH = '/ws';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) throw new Error('no url');
    const { pathname } = new URL(req.url, 'http://localhost');

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end('Method Not Allowed');
      return;
    }

    if (pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, ws: WS_PATH, uptime: process.uptime() }));
      return;
    }

    let filePath;
    if (pathname === '/vendor/io.js') {
      filePath = VENDOR_IO;
    } else {
      const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
      filePath = path.join(PUBLIC_DIR, rel);
      if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
    }

    const data = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (err) {
    if (err?.code === 'ENOENT' || err?.code === 'EISDIR') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    console.error('[http]', err);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('500 Internal Server Error');
  }
});

// IOSignal WebSocket server shares the same HTTP server, so one port is enough.
const ioServer = new Server({ httpServer: server, wsPath: WS_PATH });
ioServer.on('ready', () => {
  console.log(`[iosignal] WebSocket ready at ws://localhost:${PORT}${WS_PATH}`);
});
ioServer.on('error', (err) => console.error('[iosignal]', err));

server.listen(PORT, () => {
  console.log(`[web] http://localhost:${PORT}`);
});

function shutdown() {
  console.log('\nShutting down...');
  ioServer.close(() => {
    server.close(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
