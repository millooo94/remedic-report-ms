import puppeteer from "puppeteer";
import { env } from "../config/env.js";

let browser;
let pagePool = [];
let queue = [];

export async function initBrowserPool() {
  browser = await puppeteer.launch({
    headless: true,
    executablePath: env.chromiumPath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  console.log("🚀 Chromium avviato");

  for (let i = 0; i < env.pagePoolSize; i++) {
    const page = await browser.newPage();
    pagePool.push(page);
  }

  console.log(`📄 Pool pagine: ${env.pagePoolSize}`);
}

export async function getPage() {
  if (pagePool.length > 0) {
    return pagePool.pop();
  }

  return new Promise((resolve) => {
    queue.push(resolve);
  });
}

export function releasePage(page) {
  if (queue.length > 0) {
    const resolve = queue.shift();
    resolve(page);
  } else {
    pagePool.push(page);
  }
}
