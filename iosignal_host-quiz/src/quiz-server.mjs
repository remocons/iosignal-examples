// One HTTP port serves the web page, the IOSignal WebSocket (/ws), the quiz host and the server
// status page (/dashboard).
//
// The quiz runs inside the IOSignal server with server.host():
//   - clients send to 'quiz#in'; only the host receives it, with the sender's CID as the server
//     knows it (from.cid), so nobody can answer for someone else;
//   - only the host may send 'quiz#$state' and '@quiz.you': a client that tries is ignored.
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Server, version } from 'iosignal';
import { QuizGame } from './quiz.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const VENDOR_IO = createRequire(import.meta.url).resolve('iosignal/browser/iife/io.js');
const WS_PATH = '/ws';

export const TAGS = {
  IN: 'quiz#in',         // client -> host: { op: 'join', name } | { op: 'answer', choice }
  STATE: 'quiz#$state',  // host -> everyone: question, timer, scoreboard ('$': kept for late subscribers)
  YOU: 'quiz.you',       // host -> one player: { correct, points } after each question (arrives as '@quiz.you')
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

/** dashboard: false, true or iosignal dashboard options. */
export async function startQuiz({ port = 5181, listenHost, log = console.log, game = new QuizGame(), dashboard = true } = {}) {
  let ioServer;
  const httpServer = http.createServer(async (req, res) => {
    if (ioServer?.dashboard?.handle(req, res)) return; // /dashboard and /dashboard/io.js
    try {
      const { pathname } = new URL(req.url || '/', 'http://localhost');
      if (pathname === '/healthz') {
        const c = ioServer.stats().counters;
        res.writeHead(200, { 'Content-Type': MIME['.json'] });
        res.end(JSON.stringify({
          ok: true, iosignal: version, players: game.players.size, phase: game.phase,
          host: { inbound: c.hostInbound, denied: c.hostDenied, rejected: c.hostRejected },
        }));
        return;
      }
      const file = pathname === '/vendor/io.js' ? VENDOR_IO
        : path.join(PUBLIC_DIR, decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
      if (file !== VENDOR_IO && !file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); res.end(); return; }
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    } catch (err) {
      const notFound = err?.code === 'ENOENT' || err?.code === 'EISDIR';
      res.writeHead(notFound ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(notFound ? '404 Not Found' : '500 Internal Server Error');
    }
  });

  ioServer = new Server({ httpServer, wsPath: WS_PATH, dashboard });
  const ready = new Promise((resolve) => ioServer.once('ready', resolve));
  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, listenHost, resolve); // listenHost: undefined listens on every interface
  });
  await ready;

  // ---------------- quiz host ----------------
  const host = ioServer.host('quiz', { inbound: [TAGS.IN], own: [TAGS.STATE, '@' + TAGS.YOU] });

  // 'now' lets screens count down with the server's clock.
  const publish = () => host.publish(TAGS.STATE, { ...game.state(), now: Date.now() });
  const sendResults = () => {
    for (const [cid, result] of game.results) host.to(cid, TAGS.YOU, result);
    game.results = [];
  };

  host.on('message', (from, tag, msg) => {
    const now = Date.now();
    let changed = false;
    if (msg?.op === 'join') {
      changed = game.join(from.cid, msg.name, now);
      if (changed) log(`[quiz] + ${game.players.get(from.cid).name} ${from.cid}`);
    } else if (msg?.op === 'answer') {
      changed = game.answer(from.cid, msg.choice, now); // from.cid, never a CID inside msg
    }
    if (changed) { sendResults(); publish(); }
  });
  host.on('leave', (from) => {
    if (game.leave(from.cid)) { log(`[quiz] - ${from.cid}`); publish(); }
  });
  host.on('error', (err) => log('[quiz] handler error', err));
  ioServer.on('host:denied', (remote, tag) => log(`[quiz] dropped ${remote.cid} -> ${tag} (host-owned tag)`));

  // host.loop: like setInterval, and the dashboard shows its tick timing and the report.
  let n = 0;
  host.loop(200, (now) => {
    if (game.tick(now)) { sendResults(); publish(); }
    if (++n % 5 === 0) {
      const players = [...game.players.values()];
      const top = players.slice().sort((a, b) => b.score - a.score)[0];
      host.report({
        phase: { waiting: '대기', question: '문제', reveal: '정답 공개' }[game.phase],
        question: game.index < 0 ? '-' : `${game.index + 1}/${game.questions.length}`,
        players: players.length,
        answered: game.phase === 'question' ? `${players.filter((p) => p.answer !== null).length}/${players.length}` : '-',
        leader: top ? `${top.name} ${top.score}` : '-',
      });
    }
  });
  publish(); // the first subscribers get a retained 'waiting' state at once

  const actualPort = httpServer.address().port;
  let closing;
  const close = () => (closing ??= new Promise((resolve) => {
    host.close(); // stops the loop too
    ioServer.close(() => httpServer.close(() => resolve()));
    setTimeout(resolve, 1500).unref();
  }));
  return { port: actualPort, url: `ws://127.0.0.1:${actualPort}${WS_PATH}`, game, host, ioServer, close };
}
