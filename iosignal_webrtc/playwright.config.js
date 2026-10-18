import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests', timeout:45000, workers:1,
  use:{baseURL:'http://localhost:5180', headless:true, launchOptions:{
    ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {}),
    args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required'],
  }},
  webServer:{command:'npm run dev',url:'http://localhost:5180',reuseExistingServer:!process.env.CI},
});
