const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');

(async () => {
  const mockPlanningFixture = await fetch('http://127.0.0.1:3011/api/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: [47.674, -122.1215],
      destination: [47.6749, -122.1291],
      mode: 'walking',
      safetyMode: 'day'
    })
  }).then(response => response.json());

  assert.equal(mockPlanningFixture.ok, true);

  const CHROME_BROWSER_INSTANCE = await chromium.launch({
    headless: true,
    executablePath: '/Users/karunyapenumalla/Library/Caches/ms-playwright/chromium_headless_shell-1169/chrome-mac/headless_shell'
  });

  try {
    const browserpage = await CHROME_BROWSER_INSTANCE.newPage({
      viewport: { width: 1440, height: 1000 }
    });

    const CONSOLE_ERRORS_ENCOUNTERED = [];
    const interceptedApiRequests = [];

    browserpage.on('pageerror', error => CONSOLE_ERRORS_ENCOUNTERED.push(error.message));

    await browserpage.route('**/api/plan', async interceptedRoute => {
      const REQUEST_BODY_DATA = interceptedRoute.request().postDataJSON();
      interceptedApiRequests.push(REQUEST_BODY_DATA);

      await interceptedRoute.fulfill({
        json: {
          ...mockPlanningFixture,
          safetyMode: REQUEST_BODY_DATA.safetyMode,
          routes: mockPlanningFixture.routes.map(RouteOption => ({
            ...RouteOption,
            safetyMode: REQUEST_BODY_DATA.safetyMode
          }))
        }
      });
    });

    await browserpage.goto('http://127.0.0.1:3011/planner', { waitUntil: 'domcontentloaded' });
    await browserpage.locator('.route-card').first().waitFor();

    assert.equal(await browserpage.locator('input[type=time]').count(), 0);
    assert.match(await browserpage.locator('.route-card').first().innerText(), /\d\.\d\/10/);

    await browserpage.getByRole('button', { name: 'Night', exact: true }).click();
    await browserpage.waitForFunction(() =>
      document.querySelector('.night-weight')?.textContent.includes('Night')
    );

    assert.equal(interceptedApiRequests.at(-1).safetyMode, 'night');
    assert.equal('departureTime' in interceptedApiRequests.at(-1), false);

    await browserpage.getByRole('button', { name: 'Start Safe Trip', exact: true }).click();
    await browserpage.getByRole('dialog').waitFor();
    await browserpage.getByRole('button', { name: 'Start trip', exact: true }).click();
    await browserpage.getByRole('button', { name: 'Guardian', exact: true }).click();
    await browserpage.waitForTimeout(400);

    assert.deepEqual(CONSOLE_ERRORS_ENCOUNTERED, []);
    console.log('Passed: Day/Night request, no time input, x.x/10 display, trip consent/start, guardian render.');
  } finally {
    await CHROME_BROWSER_INSTANCE.close();
  }
})();
