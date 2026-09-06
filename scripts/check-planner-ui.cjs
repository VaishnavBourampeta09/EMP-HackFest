const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');

(async () => {
  const mock_planning_fixture = await fetch('http://127.0.0.1:3011/api/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: [47.674, -122.1215],
      destination: [47.6749, -122.1291],
      mode: 'walking',
      safetyMode: 'day'
    })
  }).then(response => response.json());

  assert.equal(mock_planning_fixture.ok, true);

  const chrome_browser_instance = await chromium.launch({
    headless: true,
    executablePath: '/Users/karunyapenumalla/Library/Caches/ms-playwright/chromium_headless_shell-1169/chrome-mac/headless_shell'
  });

  try {
    const browser_page = await chrome_browser_instance.newPage({
      viewport: { width: 1440, height: 1000 }
    });

    const console_errors_encountered = [];
    const intercepted_api_requests = [];

    browser_page.on('pageerror', error => console_errors_encountered.push(error.message));

    await browser_page.route('**/api/plan', async intercepted_route => {
      const request_body_data = intercepted_route.request().postDataJSON();
      intercepted_api_requests.push(request_body_data);

      await intercepted_route.fulfill({
        json: {
          ...mock_planning_fixture,
          safetyMode: request_body_data.safetyMode,
          routes: mock_planning_fixture.routes.map(route_option => ({
            ...route_option,
            safetyMode: request_body_data.safetyMode
          }))
        }
      });
    });

    await browser_page.goto('http://127.0.0.1:3011/planner', { waitUntil: 'domcontentloaded' });
    await browser_page.locator('.route-card').first().waitFor();

    assert.equal(await browser_page.locator('input[type=time]').count(), 0);
    assert.match(await browser_page.locator('.route-card').first().innerText(), /\d\.\d\/10/);

    await browser_page.getByRole('button', { name: 'Night', exact: true }).click();
    await browser_page.waitForFunction(() =>
      document.querySelector('.night-weight')?.textContent.includes('Night')
    );

    assert.equal(intercepted_api_requests.at(-1).safetyMode, 'night');
    assert.equal('departureTime' in intercepted_api_requests.at(-1), false);

    await browser_page.getByRole('button', { name: 'Start Safe Trip', exact: true }).click();
    await browser_page.getByRole('dialog').waitFor();
    await browser_page.getByRole('button', { name: 'Start trip', exact: true }).click();
    await browser_page.getByRole('button', { name: 'Guardian', exact: true }).click();
    await browser_page.waitForTimeout(400);

    assert.deepEqual(console_errors_encountered, []);
    console.log('Passed: Day/Night request, no time input, x.x/10 display, trip consent/start, guardian render.');
  } finally {
    await chrome_browser_instance.close();
  }
})();
