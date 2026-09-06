import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "chrome", headless: true });

for (const w of [1280, 900, 720, 390]) {
  const page = await b.newPage({ viewport: { width: w, height: 900 } });
  await page.goto("http://localhost:3001/", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    dashes: (document.body.innerText.match(/[—–]/g) || []).length,
    h: document.body.scrollHeight,
  }));
  console.log(w, JSON.stringify(r));
  await page.close();
}

const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
await page.goto("http://localhost:3001/planner", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
console.log("planner errors:", JSON.stringify(errs.slice(0, 5)));
await b.close();
