import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
page.on("console", (m) => { if (m.type()==="error") errs.push("CONSOLE: " + m.text().slice(0,200)); });
await page.goto("http://localhost:3000/planner", { waitUntil: "load", timeout: 120000 });
await page.waitForTimeout(30000);
const s = await page.evaluate(() => ({
  routeCards: document.querySelectorAll(".route-card").length,
  err: document.querySelector(".planner-error")?.innerText ?? null,
  sidebar: document.querySelector(".sidebar-float")?.innerText?.slice(0, 300) ?? null,
  bodyLen: document.body.innerText.length,
}));
console.log(JSON.stringify(s, null, 1));
console.log("ERRORS:", errs.length ? errs.slice(0, 6) : "none");
await browser.close();
