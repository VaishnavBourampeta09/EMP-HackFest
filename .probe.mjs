import { chromium } from "playwright-core";

const b = await chromium.launch({ channel: "chrome", headless: true });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
await page.goto("http://localhost:3001/", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

const box = async (sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { l: Math.round(r.left), t: Math.round(r.top + window.scrollY), r: Math.round(r.right), b: Math.round(r.bottom + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) };
}, sel);

const sels = [".hero-grid", ".hero-copy", ".hero-panel", ".crime-inner", ".crime-top", ".crime-head", ".crime-eyebrow", ".crime-ledger", ".crime-ledger-label", ".crime-stats", ".crime-detail", ".crime-headline-card", ".crime-feed", ".crime-foot"];
const out = {};
for (const s of sels) out[s] = await box(s);
const dashes = await page.evaluate(() => (document.body.innerText.match(/[—–]/g) || []).length);
const pageH = await page.evaluate(() => document.body.scrollHeight);
const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
console.log(JSON.stringify({ out, dashes, pageH, overflowX, errors: errors.slice(0, 6) }, null, 1));
await page.screenshot({ path: process.argv[2] || "shot.png", fullPage: true });
await b.close();
