const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');

(async () => {
  const fixture = await fetch('http://127.0.0.1:3011/api/plan', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({origin:[47.674,-122.1215],destination:[47.6749,-122.1291],mode:'walking',safetyMode:'day'})}).then(r=>r.json());
  assert.equal(fixture.ok, true);
  const browser = await chromium.launch({headless:true,executablePath:'/Users/karunyapenumalla/Library/Caches/ms-playwright/chromium_headless_shell-1169/chrome-mac/headless_shell'});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    const errors = [], requests = [];
    page.on('pageerror', e=>errors.push(e.message));
    await page.route('**/api/plan', async route => {
      const input = route.request().postDataJSON(); requests.push(input);
      await route.fulfill({json:{...fixture,safetyMode:input.safetyMode,routes:fixture.routes.map(r=>({...r,safetyMode:input.safetyMode}))}});
    });
    await page.goto('http://127.0.0.1:3011/planner', {waitUntil:'domcontentloaded'});
    await page.locator('.route-card').first().waitFor();
    assert.equal(await page.locator('input[type=time]').count(), 0);
    assert.match(await page.locator('.route-card').first().innerText(), /\d\.\d\/10/);
    await page.getByRole('button',{name:'Night',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.night-weight')?.textContent.includes('Night'));
    assert.equal(requests.at(-1).safetyMode,'night');
    assert.equal('departureTime' in requests.at(-1), false);
    await page.getByRole('button',{name:'Start Safe Trip',exact:true}).click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button',{name:'Start trip',exact:true}).click();
    await page.getByRole('button',{name:'Guardian',exact:true}).click();
    await page.waitForTimeout(400);
    assert.deepEqual(errors, []);
    console.log('Passed: Day/Night request, no time input, x.x/10 display, trip consent/start, guardian render.');
  } finally { await browser.close(); }
})();
