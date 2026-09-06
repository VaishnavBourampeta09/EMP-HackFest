import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "chrome", headless: true });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3001/", { waitUntil: "networkidle" });
const info = await page.evaluate(() => {
  const pick = (s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const c = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { tag: el.tagName, display: c.display, fontSize: c.fontSize, lineHeight: c.lineHeight, marginTop: c.marginTop, paddingTop: c.paddingTop, alignItems: c.alignItems, top: Math.round(r.top), h: Math.round(r.height) };
  };
  return {
    head: pick(".crime-head"),
    eyebrow: pick(".crime-eyebrow"),
    dot: pick(".crime-live-dot"),
    ledger: pick(".crime-ledger"),
    label: pick(".crime-ledger-label"),
    h2: pick("#crime-title"),
  };
});
console.log(JSON.stringify(info, null, 1));
await b.close();
