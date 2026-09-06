import { chromium } from "playwright-core";
const OUT = process.argv[2];
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type()==="error" && !/Failed to load resource|502/.test(m.text())) errs.push("console: "+m.text().slice(0,120)); });

// ---- homepage ----
await page.goto("http://localhost:3000/", { waitUntil: "load", timeout: 120000 });
await page.waitForTimeout(9000);
console.log("HOME height:", await page.evaluate(() => document.documentElement.scrollHeight));
await page.screenshot({ path: `${OUT}/home.png`, fullPage: true });

// ---- planner ----
await page.goto("http://localhost:3000/planner", { waitUntil: "load", timeout: 120000 });
await page.waitForSelector(".route-card", { timeout: 180000 });
await page.waitForTimeout(13000);

const geo = await page.evaluate(() => {
  const box = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { t: Math.round(r.top), l: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) }; };
  const side = document.querySelector(".sidebar-float");
  return {
    nav: box(".planner-nav-float"),
    mapPane: box(".map-pane"),
    streetPane: box(".street-pane"),
    handle: box(".map-split-handle"),
    mapKey: box(".map-legend__panel"),
    routeStatus: box(".map-route-status__panel"),
    sidebarScroll: side ? { scrollH: side.scrollHeight, clientH: side.clientHeight } : null,
    demoText: /demo/i.test(document.body.innerText),
    dangerLines: document.querySelectorAll(".route-danger").length,
    prefs: /monitoring preferences/i.test(document.body.innerText),
  };
});
console.log("PLANNER:", JSON.stringify(geo, null, 1));
await page.screenshot({ path: `${OUT}/planner.png` });

// ---- start a trip, then switch tabs and back ----
await page.locator(".start-trip-button").first().scrollIntoViewIfNeeded();
await page.locator(".start-trip-button").first().click();
await page.waitForSelector(".consent-sheet", { timeout: 20000 });
await page.screenshot({ path: `${OUT}/consent.png` });
await page.locator(".consent-sheet").getByRole("button", { name: /start safe trip/i }).click();
await page.waitForSelector(".active-sidebar-float", { timeout: 30000 });
await page.waitForTimeout(6000);

const trip = await page.evaluate(() => {
  const side = document.querySelector(".active-sidebar-float");
  return { scrollH: side.scrollHeight, clientH: side.clientHeight };
});
console.log("TEEN TRIP sidebar:", JSON.stringify(trip), trip.scrollH <= trip.clientH ? "(fits)" : "(scrolls)");
await page.screenshot({ path: `${OUT}/trip.png` });

await page.locator(".mode-toggle button", { hasText: "Guardian" }).click();
await page.waitForTimeout(9000);
const g = await page.evaluate(() => {
  const box = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { t: Math.round(r.top), l: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) }; };
  const side = document.querySelector(".guardian-float");
  return {
    card: box(".guardian-map-card"),
    nav: box(".planner-nav-float"),
    mapKey: box(".map-legend__panel"),
    sidebar: side ? { scrollH: side.scrollHeight, clientH: side.clientHeight } : null,
    prefs: /monitoring preferences/i.test(document.body.innerText),
    demoText: /demo/i.test(document.body.innerText),
  };
});
console.log("GUARDIAN:", JSON.stringify(g, null, 1));
await page.screenshot({ path: `${OUT}/guardian.png` });

// back to teen — trip must still be running
await page.locator(".mode-toggle button", { hasText: "Teen" }).click();
await page.waitForTimeout(5000);
const stillActive = await page.evaluate(() => !!document.querySelector(".active-sidebar-float"));
console.log("trip survived tab switch:", stillActive);

console.log("errors:", errs.length ? errs.slice(0, 5) : "none");
await browser.close();
