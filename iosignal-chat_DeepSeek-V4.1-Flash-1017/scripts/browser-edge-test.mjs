// 거절, 수동 채널 입장, 접속자 이탈, 모바일 레이아웃을 검증한다.
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';

const URL = process.env.APP_URL || 'http://localhost:5177';
const OUT = 'screenshots';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctxA = await browser.newContext({ viewport: { width: 1360, height: 860 } });
const ctxB = await browser.newContext({ viewport: { width: 1360, height: 860 } });
const A = await ctxA.newPage();
const B = await ctxB.newPage();
const errors = [];
for (const [n, p] of [['A', A], ['B', B]]) {
  p.on('console', (m) => m.type() === 'error' && errors.push(`[${n}] ${m.text()}`));
  p.on('pageerror', (e) => errors.push(`[${n}] ${e.message}`));
}
const step = async (label, fn) => { process.stdout.write(`• ${label} ... `); await fn(); console.log('ok'); };

await step('접속 및 상대 발견', async () => {
  await Promise.all([A.goto(URL), B.goto(URL)]);
  await Promise.all([
    A.waitForFunction(() => document.querySelector('#connText')?.textContent === '연결됨'),
    B.waitForFunction(() => document.querySelector('#connText')?.textContent === '연결됨'),
  ]);
  await A.waitForSelector('.peer');
  await A.waitForTimeout(400);
  await A.screenshot({ path: `${OUT}/welcome.png` });
});

await step('제안 거절', async () => {
  await A.click('.peer .negotiate');
  await A.click('.modal .primary');
  await B.waitForSelector('.modal');
  await B.getByRole('button', { name: '거절', exact: true }).click();
  await A.waitForFunction(() => [...document.querySelectorAll('.toast')].some((el) => el.textContent.includes('거절')));
  const roomHidden = await A.evaluate(() => document.querySelector('#roomView').hidden);
  if (!roomHidden) throw new Error('reject 이후에도 채팅방이 열려 있음');
  const log = await A.$$eval('.log-item', (els) => els.map((el) => el.textContent).join('\n'));
  if (!log.includes('거절')) throw new Error('거절 로그 없음');
});

await step('수동 채널 태그 입장', async () => {
  await A.click('details.manual summary');
  await A.fill('#manualChannel', 'manual-room#chat');
  await A.click('#manualJoin');
  await A.waitForSelector('#roomView', { state: 'visible' });

  await B.click('details.manual summary');
  await B.fill('#manualChannel', 'manual-room#chat');
  await B.click('#manualJoin');
  await B.waitForSelector('#roomView', { state: 'visible' });
  await A.waitForTimeout(300);

  await A.fill('#input', '수동 입장 채널 테스트');
  await A.press('#input', 'Enter');
  await B.waitForFunction(() => [...document.querySelectorAll('.bubble')].some((el) => el.textContent.includes('수동 입장')));
  const meta = await A.textContent('#roomMeta');
  if (!meta.includes('참여 2명')) throw new Error(`참여자 수 갱신 실패: ${meta}`);
});

await step('긴 한글 메시지 quota 안전 처리', async () => {
  const before = await B.$$eval('.bubble', (els) => els.length);
  await A.fill('#input', '가'.repeat(500));
  await A.press('#input', 'Enter');
  await B.waitForFunction((n) => document.querySelectorAll('.bubble').length > n, before);
  const { bytes, signalSize } = await B.evaluate(() => {
    const bubbles = [...document.querySelectorAll('.bubble')];
    return {
      bytes: new TextEncoder().encode(bubbles.at(-1).textContent).length,
      signalSize: Number(document.documentElement.dataset.iosignalSignalSize) || 0,
    };
  });
  console.log(`  message bytes: ${bytes} / signalSize: ${signalSize}`);
  if (!signalSize) throw new Error('io.quota.signalSize를 읽지 못했습니다.');
  if (bytes > signalSize) throw new Error(`quota 초과: ${bytes} > ${signalSize} bytes`);
});

await step('상대 창 닫기 → 접속자 목록에서 제거', async () => {
  await B.close();
  await A.waitForFunction(() => document.querySelectorAll('.peer').length === 0, null, { timeout: 8000 });
});

await step('모바일 레이아웃 렌더링', async () => {
  const mobile = await ctxA.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(URL);
  await mobile.waitForFunction(() => document.querySelector('#connText')?.textContent === '연결됨');
  await mobile.waitForTimeout(400);
  await mobile.screenshot({ path: `${OUT}/mobile.png`, fullPage: false });
  await mobile.close();
});

console.log('CONSOLE ERRORS:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);
console.log('EDGE PASS');
