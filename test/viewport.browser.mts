import { architecture, activity, present } from './fixtures.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderArchitecture } from '../src/render.mjs';

const { chromium }: typeof import('playwright') = await import(process.env.BIRDVIEW_PLAYWRIGHT_PATH ? pathToFileURL(process.env.BIRDVIEW_PLAYWRIGHT_PATH).href : 'playwright');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'birdview-viewport-'));
const map = architecture(fs.readFileSync(new URL('../examples/system.architecture.json', import.meta.url), 'utf8'));
const events = activity(fs.readFileSync(new URL('../examples/harness.activity.jsonl', import.meta.url), 'utf8'));
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const file = path.join(dir, 'viewer.html');
  fs.writeFileSync(file, renderArchitecture(map, events, { simulation: true }));
  for (const [width, height] of [[1440, 900], [1024, 768], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(pathToFileURL(file).href + '#lang=zh');
    await page.locator('#show-details').click();
    await page.locator('#evidence').evaluate(el => { el.textContent = 'Long evidence\n'.repeat(100); });
    for (const mode of ['activity', 'architecture']) {
      await page.locator(`[data-view="${mode}"]`).click();
      if (mode !== 'architecture') await page.locator('#activity-disclosure').evaluate(el => { if (!(el instanceof HTMLDetailsElement)) throw new Error("Expected details"); el.open = true; });
      const result = await page.evaluate(() => {
        const aside = document.querySelector('aside');
        if (!aside) throw new Error('Missing inspector');
        aside.scrollTop = 100;
        const view = document.getElementById('map-stage')?.parentElement;
        if (!view) throw new Error('Missing map stage');
        return { page: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth, asideScroll: aside.scrollTop, mapHeight: view.clientHeight, bottom: aside.getBoundingClientRect().bottom };
      });
      assert.ok(result.page <= height + 1 && result.width <= width + 1, JSON.stringify(result));
      assert.ok(result.asideScroll > 0 && result.bottom <= height && result.mapHeight > 40, JSON.stringify(result));
    }
    await page.locator('#close-details').click();
    assert.equal(await page.locator('aside').isVisible(), false);
  }
  // Common desktop screens, from small laptops to 1440p monitors, must each get a readable
  // map with the current change in view and a toolbar that fits.
  const screens = [[1024, 768], [1280, 720], [1366, 768], [1440, 900], [1536, 864], [1680, 1050], [1920, 1080], [2560, 1440]] as const;
  let previousRoot = 0;
  for (const [width, height] of screens) {
    await page.setViewportSize({ width, height });
    await page.goto(pathToFileURL(file).href + '#lang=zh');
    // Interface text scales with the screen inside fixed bounds and never shrinks on a larger one.
    const root = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    assert.ok(root >= 14 && root <= 18 && root >= previousRoot, JSON.stringify({ width, height, root, previousRoot }));
    previousRoot = root;
    for (const mode of ['activity', 'architecture']) {
      await page.locator(`[data-view="${mode}"]`).click();
      const result = await page.evaluate(() => {
        const frame = document.querySelector('.map-pane .map-scroll')?.getBoundingClientRect();
        const heading = document.querySelector<HTMLElement>('.map-heading');
        if (!frame || !heading) throw new Error('Missing map layout');
        const inView = [...document.querySelectorAll('#map .activity-target')].every(node => {
          const box = node.getBoundingClientRect();
          return box.left >= frame.left - 1 && box.right <= frame.right + 1 && box.top >= frame.top - 1 && box.bottom <= frame.bottom + 1;
        });
        return { zoom: parseInt(document.getElementById('zoom-value')?.textContent ?? '0', 10), pageWidth: document.documentElement.scrollWidth, pageHeight: document.documentElement.scrollHeight, headingOverflow: heading.scrollWidth - heading.clientWidth, inView };
      });
      const label = JSON.stringify({ width, height, mode, ...result });
      assert.ok(result.pageWidth <= width + 1 && result.pageHeight <= height + 1, label);
      assert.ok(result.zoom >= 80, label);
      assert.ok(result.headingOverflow <= 1, label);
      assert.ok(result.inView, label);
    }
  }
  console.log('Viewport checks passed: desktop/tablet/mobile, all views, long evidence and expanded activity details.');
  console.log(`Screen matrix passed: ${screens.map(([width, height]) => `${width}x${height}`).join(', ')} keep a readable map, the change in view and a fitting toolbar.`);
} finally {
  await browser.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
