// Real sockets: two WebSocket clients play through the IOSignal server and its quiz host.
import test from 'node:test';
import assert from 'node:assert/strict';
import { IO } from 'iosignal';
import { startQuiz, TAGS } from '../src/quiz-server.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = fn(); if (v) return v; await wait(20); }
  throw new Error('timeout');
};

async function player(url, name) {
  const io = new IO(url);
  const p = { io, state: null, you: [] };
  io.on('message', (tag, s) => { if (tag === TAGS.STATE) p.state = s; });
  io.on('@' + TAGS.YOU, (_t, r) => p.you.push(r));
  await until(() => io.stateName === 'ready');
  io.subscribe(TAGS.STATE);
  if (name) io.signal(TAGS.IN, { op: 'join', name });
  return p;
}

test('two players answer; the host scores by the sender the server knows', async () => {
  const quiz = await startQuiz({ port: 0, log: () => {} });
  const a = await player(quiz.url, 'alice');
  const b = await player(quiz.url, 'bob');
  try {
    await until(() => a.state?.players.length === 2 && a.state.phase === 'question');
    const right = quiz.game.questions[quiz.game.index].answer;

    // bob puts alice's CID in the payload: it is still bob's answer.
    b.io.signal(TAGS.IN, { op: 'answer', choice: (right + 1) % 4, cid: a.io.cid });
    a.io.signal(TAGS.IN, { op: 'answer', choice: right });
    await until(() => a.state.phase === 'reveal');
    const score = Object.fromEntries(a.state.players.map((p) => [p.name, p.score]));
    assert.ok(score.alice > 0, 'alice answered right');
    assert.equal(score.bob, 0, 'bob answered wrong, as himself');
    await until(() => a.you.length === 1 && b.you.length === 1);
    assert.equal(a.you[0].correct, true);
    assert.equal(b.you[0].correct, false);

    // A forged scoreboard from a client never reaches anyone.
    b.io.signal(TAGS.STATE, { ...a.state, players: [{ cid: b.io.cid, name: 'bob', score: 9999 }] });
    a.io.signal(`${b.io.cid}@${TAGS.YOU}`, { correct: true, points: 100 });
    await wait(200);
    assert.ok(a.state.players.every((p) => p.score !== 9999));
    assert.equal(b.you.length, 1);
    assert.equal(quiz.ioServer.stats().counters.hostDenied, 2);

    // A late subscriber gets the retained state at once.
    const late = await player(quiz.url);
    await until(() => late.state?.players.length === 2, 1000);
    late.io.destroy();

    // The status page and its data: the quiz host with its loop timing and report.
    assert.equal((await fetch(`http://127.0.0.1:${quiz.port}/dashboard`)).status, 200);
    const dash = [];
    a.io.on('@iosignal.dashboard', (_t, m) => dash.push(m));
    a.io.signal('iosignal.dashboard#in', { op: 'hello' });
    await until(() => dash.some((m) => m.type === 'tick' && m.hosts.some((h) => h.name === 'quiz' && h.loops.length && h.report.question)));

    // A closed connection leaves the game at once.
    b.io.destroy();
    await until(() => a.state.players.length === 1, 2000);
  } finally {
    a.io.destroy();
    b.io.destroy();
    await quiz.close();
  }
});
