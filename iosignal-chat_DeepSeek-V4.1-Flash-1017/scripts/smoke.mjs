// 두 개의 Node 클라이언트로 협상 → 채널 대화 흐름을 검증하는 스모크 테스트.
import assert from 'node:assert/strict';
import { IO } from 'iosignal';

const URL = process.env.WS_URL || 'ws://localhost:5177/ws';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ready = (io) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('ready timeout')), 5000);
  io.on('ready', () => { clearTimeout(t); resolve(); });
  io.on('error', (e) => { clearTimeout(t); reject(e); });
});

const a = new IO(URL);
const b = new IO(URL);
await Promise.all([ready(a), ready(b)]);
console.log('ready:', a.cid, b.cid);
assert.ok(a.cid && b.cid && a.cid !== b.cid);

a.subscribe('lobby#presence');
b.subscribe('lobby#presence');
await wait(150);

const presence = [];
b.on('message', (tag, msg) => { if (tag === 'lobby#presence') presence.push(msg); });
a.signal('lobby#presence', { cid: a.cid, nick: 'A' });
await wait(150);
assert.equal(presence.at(-1)?.cid, a.cid);

// B waits for the proposal, accepts it, and both join the negotiated channel.
const channel = 'smoke-room#chat';
const seenByB = [];
let bCid = b.cid;

b.on('@negotiate', (tag, msg) => {
  assert.equal(tag, '@negotiate');
  if (msg.type !== 'propose') return;
  seenByB.push(msg);
  b.signal(`${msg.from.cid}@negotiate`, {
    v: 1, type: 'accept', id: msg.id, channel: msg.channel, from: { cid: b.cid, nick: 'B' },
  });
});

const accepted = new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('accept timeout')), 5000);
  a.on('@negotiate', (tag, msg) => {
    if (msg.type === 'accept') { clearTimeout(t); resolve(msg); }
  });
});

a.signal(`${bCid}@negotiate`, {
  v: 1, type: 'propose', id: 'neg-1', channel, note: 'hello', from: { cid: a.cid, nick: 'A' },
});

const acceptMsg = await accepted;
assert.equal(acceptMsg.channel, channel);
assert.equal(seenByB.length, 1);
console.log('negotiation ok:', acceptMsg.type, acceptMsg.channel);

a.subscribe(channel);
b.subscribe(channel);
await wait(200);

const gotByB = new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('chat timeout')), 5000);
  b.on('message', (tag, msg) => {
    if (tag === channel && msg?.kind === 'chat') { clearTimeout(t); resolve(msg); }
  });
});

a.signal(channel, { kind: 'chat', msgId: 'm1', cid: a.cid, nick: 'A', text: '안녕하세요', ts: Date.now() });
const chat = await gotByB;
assert.equal(chat.text, '안녕하세요');
assert.equal(chat.cid, a.cid);
console.log('chat ok:', chat.text);

// direct tag without subscription
const direct = new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('direct timeout')), 5000);
  b.on('@ping', (tag, msg) => { clearTimeout(t); resolve(msg); });
});
a.signal(`${b.cid}@ping`, { hello: 'direct' });
assert.deepEqual(await direct, { hello: 'direct' });
console.log('direct ok');

a.stop();
b.stop();
await wait(100);
console.log('SMOKE PASS');
process.exit(0);
