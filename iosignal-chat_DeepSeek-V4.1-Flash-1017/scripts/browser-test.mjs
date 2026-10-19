// 실제 Chrome 두 창에서 협상 → 채팅 → 역제안 흐름을 검증한다.
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';

const URL = process.env.APP_URL || 'http://localhost:5177';
const OUT = 'screenshots';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const A = await ctxA.newPage();
const B = await ctxB.newPage();

const errors = [];
for (const [name, page] of [['A', A], ['B', B]]) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[${name}] console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`[${name}] pageerror: ${err.message}`));
}

const step = async (label, fn) => {
  process.stdout.write(`• ${label} ... `);
  await fn();
  console.log('ok');
};

await step('두 창 접속', async () => {
  await Promise.all([A.goto(URL), B.goto(URL)]);
  await Promise.all([
    A.waitForFunction(() => document.querySelector('#connText')?.textContent === '연결됨'),
    B.waitForFunction(() => document.querySelector('#connText')?.textContent === '연결됨'),
  ]);
});

const nickA = await A.inputValue('#nickInput');
const nickB = await B.inputValue('#nickInput');
console.log('  nicknames:', nickA, '/', nickB);

await step('상대 발견', async () => {
  await Promise.all([
    A.waitForSelector('.peer'),
    B.waitForSelector('.peer'),
  ]);
});

await step('A → B 채널 제안', async () => {
  await A.click('.peer .negotiate');
  await A.waitForSelector('#modalChannel');
  await A.fill('#modalNote', '프로젝트 이야기');
  await A.click('.modal .primary');
  await B.waitForSelector('.modal');
  await B.waitForTimeout(400);
  await B.screenshot({ path: `${OUT}/modal-b.png` });
});

await step('B 수락', async () => {
  await B.getByRole('button', { name: '수락', exact: true }).click();
  await Promise.all([
    A.waitForSelector('#roomView', { state: 'visible' }),
    B.waitForSelector('#roomView', { state: 'visible' }),
  ]);
});

const tagA = await A.textContent('#roomMeta');
const tagB = await B.textContent('#roomMeta');
console.log('  room meta A:', tagA);
console.log('  room meta B:', tagB);

await step('A 메시지 → B 수신', async () => {
  await A.fill('#input', '안녕하세요! IOSignal로 보내는 첫 메시지입니다.');
  await A.press('#input', 'Enter');
  await B.waitForFunction(() =>
    [...document.querySelectorAll('.bubble')].some((el) => el.textContent.includes('첫 메시지')),
  );
});

await step('B 답장 → A 수신', async () => {
  await B.fill('#input', '반가워요. 채널 협상이 잘 되었네요 👍');
  await B.click('#sendBtn');
  await A.waitForFunction(() =>
    [...document.querySelectorAll('.bubble')].some((el) => el.textContent.includes('반가워요')),
  );
});

await A.waitForTimeout(500);
await A.screenshot({ path: `${OUT}/chat-a.png` });
await B.screenshot({ path: `${OUT}/chat-b.png` });

await step('양쪽 채널 나가기', async () => {
  await A.click('#leaveRoom');
  await B.click('#leaveRoom');
  await Promise.all([
    A.waitForSelector('#welcome', { state: 'visible' }),
    B.waitForSelector('#welcome', { state: 'visible' }),
  ]);
});

await step('A 재제안 → B 역제안 → A 수락', async () => {
  await A.waitForFunction(() => document.querySelectorAll('.peer').length > 0);
  await A.click('.peer .negotiate');
  await A.waitForSelector('#modalChannel');
  await A.fill('#modalChannel', 'first-room#chat');
  await A.click('.modal .primary');

  await B.waitForSelector('.modal');
  await B.fill('#modalChannel', 'second-room#chat');
  await B.fill('#modalNote', '이름을 바꿔서 다시 제안합니다');
  await B.getByRole('button', { name: '역제안', exact: true }).click();

  await A.waitForFunction(() =>
    document.querySelector('.modal-kicker')?.textContent === 'COUNTER PROPOSAL',
  );
  await A.waitForTimeout(300);
  await A.screenshot({ path: `${OUT}/modal-counter-a.png` });
  await A.fill('#modalNote', '좋아요, 그 이름으로 합시다');
  await A.getByRole('button', { name: '수락', exact: true }).click();

  await Promise.all([
    A.waitForFunction(() => document.querySelector('#roomMeta')?.textContent.includes('second-room#chat')),
    B.waitForFunction(() => document.querySelector('#roomMeta')?.textContent.includes('second-room#chat')),
  ]);
});

await step('역제안 채널에서 대화', async () => {
  await A.fill('#input', '역제안으로 합의된 채널입니다.');
  await A.press('#input', 'Enter');
  await B.waitForFunction(() =>
    [...document.querySelectorAll('.bubble')].some((el) => el.textContent.includes('합의된 채널')),
  );
});

await B.screenshot({ path: `${OUT}/negotiation-b.png` });

await step('협상 로그 확인', async () => {
  const logs = await B.$$eval('.log-item', (els) => els.map((el) => el.textContent));
  console.log('\n  B 협상 로그:');
  for (const line of logs.slice(-8)) console.log('   ', line);
});

console.log('\nCONSOLE ERRORS:', errors.length ? errors : 'none');

await browser.close();
if (errors.length) process.exit(1);
console.log('BROWSER PASS');
