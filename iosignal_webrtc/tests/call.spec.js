import { test, expect } from '@playwright/test';
const enter = async (page,room) => {
  await page.goto('/');
  if (process.env.SIGNAL_TEST_URL) await page.locator('#endpoint').fill(process.env.SIGNAL_TEST_URL);
  await page.locator('#room').fill(room);
  await page.locator('#ice-settings').evaluate(e=>e.open=true);
  await page.locator('#stun').fill('');
  await page.locator('#ice-settings').evaluate(e=>e.open=false); // Deterministic local ICE; no external STUN dependency.
};
const connected = async page => {
  await expect(page.locator('#call-status')).toContainText('통화 연결됨',{timeout:25000});
  await expect.poll(()=>page.locator('#remote-video').evaluate(v=>v.videoWidth)).toBeGreaterThan(0);
  await expect.poll(()=>page.locator('#remote-video').evaluate(v=>v.currentTime)).toBeGreaterThan(0);
};
test('real IOSignal + two browser WebRTC peers, media, controls, busy room, cleanup and rejoin', async ({browser}) => {
  const contexts = await Promise.all([browser.newContext(),browser.newContext(),browser.newContext()]);
  const [host,guest,third] = await Promise.all(contexts.map(c=>c.newPage()));
  const errors=[]; for(const page of [host,guest,third]) page.on('pageerror',e=>errors.push(e.message));
  for(const page of [host,guest,third]) await enter(page,'test-room');
  await host.locator('#host').click(); await expect(host.locator('#signal-state')).toHaveText('ready');
  await guest.locator('#join').click();
  await Promise.all([connected(host),connected(guest)]);
  await expect.poll(()=>host.locator('#remote-video').evaluate(v=>v.srcObject.getAudioTracks().length)).toBe(1);
  await expect(host.locator('#logs')).toContainText('send.offer');
  await expect(guest.locator('#logs')).toContainText('send.answer');
  await host.locator('#mic').click();
  expect(await host.locator('#local-video').evaluate(v=>v.srcObject.getAudioTracks()[0].enabled)).toBe(false);
  await host.locator('#camera').click();
  expect(await host.locator('#local-video').evaluate(v=>v.srcObject.getVideoTracks()[0].enabled)).toBe(false);
  await host.locator('#mic').click(); await host.locator('#camera').click();
  await host.locator('#layout').selectOption('equal'); await expect(host.locator('#stage')).toHaveAttribute('data-layout','equal');
  await host.locator('#layout').selectOption('local'); await expect(host.locator('#stage')).toHaveAttribute('data-layout','local');
  await host.locator('#volume').fill('30'); expect(await host.locator('#remote-video').evaluate(v=>v.volume)).toBe(.3);
  await third.locator('#join').click(); await expect(third.locator('#notice')).toContainText('이미 통화 중');
  await third.locator('#leave').click();
  // Keep track references so stopping is verified after srcObject is cleared.
  await host.evaluate(()=>window.testTracks=document.querySelector('#local-video').srcObject.getTracks());
  await guest.locator('#leave').click();
  await expect(host.locator('#notice')).toContainText('상대가 통화를 종료');
  expect(await host.evaluate(()=>window.testTracks.every(t=>t.readyState==='ended'))).toBe(true);
  await host.locator('#host').click(); await expect(host.locator('#signal-state')).toHaveText('ready');
  await guest.locator('#join').click(); await Promise.all([connected(host),connected(guest)]);
  await guest.close(); await expect(host.locator('#notice')).toContainText('상대가 통화를 종료');
  expect(errors).toEqual([]); await Promise.all(contexts.map(c=>c.close()));
});
test('validation, invite URL, TURN credentials excluded, responsive layout',async({page})=>{
  await page.goto('/');
  await page.locator('#room').fill('bad room'); await page.locator('#host').click();
  await expect(page.locator('#notice')).toContainText('채널명은');
  await page.locator('#room').fill('qr-demo');
  await page.locator('#endpoint').fill('wss://io.iosignal.net/ws');
  await page.locator('#ice-settings').evaluate(e=>e.open=true);
  await page.locator('#turn-pass').fill('must-not-be-shared');
  await expect(page.locator('#invite')).toHaveValue(/room=qr-demo/);
  expect(await page.locator('#invite').inputValue()).not.toContain('must-not-be-shared');
  await page.locator('#relay').check(); await page.locator('#host').click();
  await expect(page.locator('#notice')).toContainText('TURN 서버가 필요');
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('guest can arrive before host',async({browser})=>{
  const a=await browser.newContext(),b=await browser.newContext();
  const guest=await a.newPage(),host=await b.newPage();
  const room = `guest-first-${Date.now().toString(36)}`;
  await enter(guest,room); await enter(host,room);
  await guest.locator('#join').click(); await expect(guest.locator('#signal-state')).toHaveText('ready');
  await host.locator('#host').click(); await Promise.all([connected(host),connected(guest)]);
  await a.close(); await b.close();
});
test('camera permission denial leaves controls recoverable',async({browser})=>{
  const context=await browser.newContext(); const page=await context.newPage();
  await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('denied','NotAllowedError');};});
  await enter(page,'denied'); await page.locator('#host').click();
  await expect(page.locator('#notice')).toContainText('권한');
  await expect(page.locator('#host')).toBeEnabled(); await expect(page.locator('#leave')).toBeDisabled();
  await context.close();
});


test('compact default invite, custom server roundtrip and QR enlargement', async ({page,context}) => {
  await page.goto('/');
  const defaultServer = await page.locator('#endpoint').inputValue();
  await page.locator('#room').fill('qr-short');
  await expect(page.locator('#invite')).toHaveValue(/#room=qr-short$/);
  expect(await page.locator('#qr').evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(160);
  await page.locator('#qr-open').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.locator('#qr-large').evaluate(el=>el.getBoundingClientRect().width)).toBe(320);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('#qr-open')).toBeFocused();
  const recipient = await context.newPage();
  await recipient.goto(await page.locator('#invite').inputValue());
  await expect(recipient.locator('#endpoint')).toHaveValue(defaultServer);
  await expect(recipient.locator('#room')).toHaveValue('qr-short');
  await page.locator('#endpoint').fill('wss://custom.example/ws');
  await expect(page.locator('#invite')).toHaveValue(/server=wss%3A%2F%2Fcustom.example%2Fws/);
  const customRecipient = await context.newPage();
  await customRecipient.goto(await page.locator('#invite').inputValue());
  await expect(customRecipient.locator('#endpoint')).toHaveValue('wss://custom.example/ws');
  await page.setViewportSize({width:390,height:844});
  await page.locator('#qr-open').click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#qr-close').click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
