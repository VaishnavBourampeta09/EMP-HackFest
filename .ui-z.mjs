import { chromium } from "playwright-core";
const OUT = process.argv[2];
const B = "http://localhost:3001";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type()==="error" && !/Failed to load resource|50\d/.test(m.text())) errs.push("console: "+m.text().slice(0,110)); });

await page.goto(B + "/", { waitUntil: "load", timeout: 120000 });
await page.waitForTimeout(9000);
const home = await page.evaluate(() => ({
  height: document.documentElement.scrollHeight,
  sections: document.querySelectorAll(".crime-section, .story-chapter").length,
  ladder: document.querySelectorAll(".ladder").length,
}));
console.log("HOME:", JSON.stringify(home));
await page.screenshot({ path: `${OUT}/home.png`, fullPage: true });

await page.goto(B + "/planner", { waitUntil: "load", timeout: 120000 });
await page.waitForSelector(".route-card", { timeout: 180000 });
await page.waitForTimeout(14000);
const plan = await page.evaluate(() => {
  const s = document.querySelector(".sidebar-float");
  return {
    sidebar: { scrollH: s.scrollHeight, clientH: s.clientHeight },
    dangerLines: document.querySelectorAll(".route-danger").length,
    frames: document.querySelectorAll(".street-view-tick").length,
  };
});
console.log("PLANNER:", JSON.stringify(plan), plan.sidebar.scrollH <= plan.sidebar.clientH ? "(fits)" : `(scrolls ${Math.round(plan.sidebar.scrollH/plan.sidebar.clientH*10)/10}x)`);
await page.screenshot({ path: `${OUT}/planner.png` });

await page.locator(".start-trip-button").first().scrollIntoViewIfNeeded();
await page.locator(".start-trip-button").first().click();
await page.waitForSelector(".consent-sheet", { timeout: 20000 });
await page.locator(".consent-sheet").getByRole("button", { name: /start safe trip/i }).click();
await page.waitForSelector(".active-sidebar-float", { timeout: 30000 });
await page.waitForTimeout(8000);
const trip = await page.evaluate(() => { const s=document.querySelector(".active-sidebar-float"); return {scrollH:s.scrollHeight,clientH:s.clientHeight}; });
console.log("TEEN TRIP sidebar:", JSON.stringify(trip), trip.scrollH<=trip.clientH?"(fits)":"(scrolls)");
await page.screenshot({ path: `${OUT}/trip.png` });

await page.locator(".mode-toggle button", { hasText: "Guardian" }).click();
await page.waitForTimeout(10000);
const g = await page.evaluate(() => {
  const box=(s)=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {t:Math.round(r.top),l:Math.round(r.left),w:Math.round(r.width),h:Math.round(r.height)};};
  const s=document.querySelector(".guardian-float");
  return { card: box(".guardian-map-card"), pane: box(".map-pane"), nav: box(".planner-nav-float"), mapKey: box(".map-legend__panel"),
    stats: document.querySelectorAll(".guardian-map-card-stats > div").length,
    danger: !!document.querySelector(".guardian-map-card-danger"),
    sidebar: s?{scrollH:s.scrollHeight,clientH:s.clientHeight}:null };
});
console.log("GUARDIAN:", JSON.stringify(g, null, 1));
await page.screenshot({ path: `${OUT}/guardian.png` });
console.log("errors:", errs.length?errs.slice(0,4):"none");
await browser.close();
