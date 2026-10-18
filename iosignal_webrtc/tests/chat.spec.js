import { test, expect } from '@playwright/test';
for (const [name, port] of [['React',5173],['Svelte',5174],['Vanilla',5175],['CDN',5176]]) {
  test(`${name}: two clients exchange messages and reconnect`, async ({browser}) => {
    const a = await browser.newPage(); const b = await browser.newPage();
    const errors=[]; a.on('pageerror',e=>errors.push(e.message)); b.on('pageerror',e=>errors.push(e.message));
    await Promise.all([a.goto(`http://localhost:${port}`),b.goto(`http://localhost:${port}`)]);
    await expect(a.getByRole('button',{name:'Send',exact:true})).toBeEnabled();
    await expect(b.getByRole('button',{name:'Send',exact:true})).toBeEnabled();
    const send=async (from,to,msg)=>{
      await from.getByRole('textbox',{name:'Message',exact:true}).fill(msg);
      await from.getByRole('button',{name:'Send',exact:true}).click();
      await expect(to.getByRole('log')).toContainText(msg);
    };
    await send(a,b,`${name}-forward-${Date.now()}`);
    await send(b,a,`${name}-reverse-${Date.now()}`);
    await b.reload(); await expect(b.getByRole('button',{name:'Send',exact:true})).toBeEnabled();
    await send(a,b,`${name}-reconnected-${Date.now()}`);
    expect(errors).toEqual([]); await a.close(); await b.close();
  });
}
