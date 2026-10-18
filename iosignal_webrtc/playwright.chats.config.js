import { defineConfig } from '@playwright/test';
const apps=[['react',5173],['svelte',5174],['vanilla',5175],['vanilla-chat_CDN',5176]];
export default defineConfig({
 testDir:'./tests',testMatch:'chat.spec.js',timeout:45000,workers:1,
 use:{headless:true,launchOptions:{...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})}},
 webServer:apps.map(([name,port])=>({command:`npm --prefix ../iosignal_${name==='vanilla-chat_CDN'?name:name+'-chat'} run dev`,url:`http://localhost:${port}`,reuseExistingServer:false})),
});
