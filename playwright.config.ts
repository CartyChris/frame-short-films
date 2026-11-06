import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./e2e',timeout:40000,workers:1,use:{baseURL:process.env.FRAME_TEST_URL||'http://127.0.0.1:5173',viewport:{width:1440,height:1000},launchOptions:{executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'},acceptDownloads:true},reporter:'list'});
