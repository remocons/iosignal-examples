// README/결과물용 스크린샷 생성 (두 창 협상 → 대화)
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';

const URL = process.env.APP_URL || 'http://localhost:5177';
const OUT = 'screenshots';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const options = { viewport: { width: 1360, height: 860 }, deviceScaleFactor: 2 };
const A = await (await browser.newContext(options)).newPage();
const B = await (await browser.newContext(options)).newPage();

await Promise.all([A.goto(URL), B.goto(URL)]);
await Promise.all([
  A.waitForFunction(() => document.querySelector('#connText')?.textContent === '연결됨'),
  B.waitForFunction(() => document.querySelector('#connText')?.textContent === '연결됨'),
]);
await A.waitForSelector('.peer');
await A.waitForTimeout(1500);
await A.screenshot({ path: `${OUT}/welcome.png` });

await A.click('.peer .negotiate');
await A.fill('#modalNote', '주말 프로젝트 이야기');
await A.click('.modal .primary');
await B.waitForSelector('.modal');
await B.waitForTimeout(700);
await B.screenshot({ path: `${OUT}/proposal.png` });

await B.getByRole('button', { name: '수락', exact: true }).click();
await Promise.all([
  A.waitForSelector('#roomView', { state: 'visible' }),
  B.waitForSelector('#roomView', { state: 'visible' }),
]);
await A.waitForTimeout(600);

await A.fill('#input', '안녕하세요! IOSignal 채널 협상으로 연결됐어요.');
await A.press('#input', 'Enter');
await B.waitForFunction(() => [...document.querySelectorAll('.bubble')].some((el) => el.textContent.includes('채널 협상')));
await B.fill('#input', '반가워요 👋 제안해 주신 채널로 잘 들어왔습니다.');
await B.click('#sendBtn');
await A.waitForFunction(() => [...document.querySelectorAll('.bubble')].some((el) => el.textContent.includes('반가워요')));
await A.fill('#input', '이제 이 채널 태그로 계속 이야기하면 됩니다.');
await A.press('#input', 'Enter');
await B.waitForTimeout(3600); // 토스트가 사라진 뒤 촬영
await A.screenshot({ path: `${OUT}/chat-a.png` });
await B.screenshot({ path: `${OUT}/chat-b.png` });

// 역제안 모달
await A.click('#leaveRoom');
await B.click('#leaveRoom');
await A.waitForSelector('#welcome', { state: 'visible' });
await A.click('.peer .negotiate');
await A.fill('#modalChannel', 'first-room#chat');
await A.click('.modal .primary');
await B.waitForSelector('.modal');
await B.fill('#modalChannel', 'second-room#chat');
await B.fill('#modalNote', '이름을 바꿔서 다시 제안합니다');
await B.getByRole('button', { name: '역제안', exact: true }).click();
await A.waitForFunction(() =>
  document.querySelector('.modal-kicker')?.textContent === 'COUNTER PROPOSAL',
);
await A.waitForTimeout(800);
await A.screenshot({ path: `${OUT}/counter.png` });

await browser.close();
console.log('screenshots done');
