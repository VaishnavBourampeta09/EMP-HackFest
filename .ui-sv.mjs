import { chromium } from "playwright-core";
const OUT = process.argv[2];
const B = "http://localhost:3001";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type()==="error" && !/Failed to load resource|50\d/.test(m.text())) errs.push("console: "+m.text().slice(0,120)); });
const bad = [];
page.on("response", (r) => { if (r.url().includes("/api/streetview") && r.status() >= 400) bad.push(r.status()); });

// homepage should compile clean now
await page.goto(B + "/", { waitUntil: "load", timeout: 120000 });
await page.waitForTimeout(7000);
const home = await page.evaluate(() => ({
  rows: document.querySelectorAll(".crime-row").length,
  height: document.documentElement.scrollHeight,
}));
console.log("HOME:", JSON.stringify(home));

await page.goto(B + "/planner", { waitUntil: "load", timeout: 120000 });
await page.waitForSelector(".route-card", { timeout: 180000 });
await page.waitForSelector(".street-view-image", { timeout: 90000 });
await page.waitForTimeout(9000);

// Preview mode: frames should advance on their own.
const a = await page.evaluate(() => document.querySelector(".street-view-nav span")?.textContent);
await page.waitForTimeout(3000);
const b = await page.evaluate(() => document.querySelector(".street-view-nav span")?.textContent);
console.log("auto-advance:", a, "->", b, a !== b ? "(moving)" : "(static)");

// Manual pick must stop the auto-advance.
await page.locator(".street-view-tick").nth(2).click();
await page.waitForTimeout(600);
const pickedAt = await page.evaluate(() => ({
  idx: document.querySelector(".street-view-nav span")?.textContent,
  subtitle: document.querySelector(".street-view-titles span")?.textContent,
  resume: !!document.querySelector(".street-view-resume"),
}));
await page.waitForTimeout(4000);
const stillAt = await page.evaluate(() => document.querySelector(".street-view-nav span")?.textContent);
console.log("after manual pick:", JSON.stringify(pickedAt));
console.log("held position:", pickedAt.idx, "->", stillAt, pickedAt.idx === stillAt ? "(HELD)" : "(MOVED — bug)");

// Crossfade layers present.
const layers = await page.evaluate(() => ({
  base: document.querySelectorAll(".street-view-image-base").length,
  top: document.querySelectorAll(".street-view-image:not(.street-view-image-base)").length,
}));
console.log("crossfade layers:", JSON.stringify(layers));

console.log("streetview error responses:", bad.length ? bad : "none");
console.log("errors:", errs.length ? errs.slice(0, 4) : "none");
await page.screenshot({ path: `${OUT}/planner.png` });
await browser.close();
