import { architecture, activity, present } from './fixtures.mjs';
import type { Architecture, ActivityEvent } from '../src/contracts/models.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderArchitecture } from '../src/render.mjs';

// Set BIRDVIEW_PLAYWRIGHT_PATH to a local Playwright module if not installed here.
const { chromium }: typeof import('playwright') = await import(process.env.BIRDVIEW_PLAYWRIGHT_PATH
  ? pathToFileURL(process.env.BIRDVIEW_PLAYWRIGHT_PATH).href : 'playwright');
const read = (name: string) => fs.readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8');
const map = architecture(read('system.architecture.json'));
const events = activity(read('harness.activity.jsonl'));
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'birdview-views-'));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const load = async (data: Architecture, records: ActivityEvent[], simulation: boolean) => {
    const file = path.join(output, `viewer-${data.mapId}-${simulation ? 'simulation' : 'snapshot'}.html`);
    fs.writeFileSync(file, renderArchitecture(data, records, { simulation }));
    await page.goto(`${pathToFileURL(file).href}#lang=zh`);
    await page.waitForFunction(() => document.querySelector('#nodes .node strong')?.textContent);
  };
  await load(map, events, true);
  assert.equal(await page.locator('#activity-step').inputValue(), '0');
  assert.equal(await page.locator('#activity-summary').isVisible(), true);
  assert.equal(await page.locator('#activity-source').isVisible(), true);
  await page.locator('#activity-disclosure summary').click();
  assert.equal(await page.locator('#activity-details').isVisible(), true);
  await page.locator('#activity-disclosure summary').click();
  assert.equal(await page.locator('#map .activity-target').count(), present(events[0]).targets.length);
  assert.equal(await page.locator('#activity-disclosure').getAttribute('open'), null);
  // Planned steps open the outside-scope impact layer by default, on top of the targets.
  const impactScope = present(events[0]).scope;
  const crossing = (scope: string[]) => new Set(map.relationships.flatMap(relation => scope.includes(relation.from) === scope.includes(relation.to) ? [] : [scope.includes(relation.from) ? relation.to : relation.from]));
  assert.equal(await page.locator('[data-view]').count(), 2);
  assert.equal(await page.locator('#impact-toggle').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#impact-panel').isVisible(), true);
  assert.equal(await page.locator('#map .impact-neighbor').count(), crossing(impactScope).size);
  assert.equal(await page.locator('#impact-panel .impact-row.neighbor').count(), crossing(impactScope).size);
  const groupColors = await page.locator('#groups .group-frame').evaluateAll(nodes => Object.fromEntries(nodes.map(node => [node.getAttribute('data-role'), getComputedStyle(node).backgroundColor])));
  await page.locator('#groups').evaluate(node => { if (!node.lastElementChild) throw new Error("Missing group"); node.prepend(node.lastElementChild); });
  assert.deepEqual(await page.locator('#groups .group-frame').evaluateAll(nodes => Object.fromEntries(nodes.map(node => [node.getAttribute('data-role'), getComputedStyle(node).backgroundColor]))), groupColors);
  await page.locator('#groups').evaluate(node => { if (!node.firstElementChild) throw new Error("Missing group"); node.append(node.firstElementChild); });
  const ids = await page.locator('[id]').evaluateAll(nodes => nodes.map(node => node.id));
  assert.equal(new Set(ids).size, ids.length);
  // Later phases default it off; once flipped, the reader's choice holds across steps,
  // including terminal steps that have no targets.
  await page.locator('#activity-next').click();
  assert.equal(await page.locator('#impact-toggle').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('#impact-panel').isVisible(), false);
  assert.equal(await page.locator('#map .impact-neighbor').count(), 0);
  await page.locator('#impact-toggle').click();
  assert.equal(await page.locator('#map .impact-neighbor').count(), crossing(present(events[1]).scope).size);
  assert.deepEqual(await page.locator('#map .activity-target').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-module'))), present(events[1]).targets);
  await page.locator('#activity-latest').click();
  assert.equal(await page.locator('#impact-toggle').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#map .impact-neighbor').count(), crossing(present(events.at(-1)).scope).size);
  const neighborRow = page.locator('#impact-panel .impact-row.neighbor').first();
  const neighborId = await neighborRow.getAttribute('data-module');
  await neighborRow.click();
  assert.equal(await page.locator('#map .selected').getAttribute('data-module'), neighborId);
  await page.locator('#close-details').click();
  await page.locator('#activity-step').selectOption('0');
  await page.locator('[data-view="activity"]').click();
  await page.locator('#language').selectOption('en');
  for (let index = 0; index < events.length; index++) {
    await page.locator('#activity-step').selectOption(String(index));
    assert.doesNotMatch(present(await page.locator('#activity-summary').textContent()), /[\u3400-\u9fff]/);
    assert.doesNotMatch(present(await page.locator('#activity-details').textContent()), /[\u3400-\u9fff]/);
  }
  await page.locator('#activity-step').selectOption('1');
  assert.doesNotMatch(present(await page.locator('#impact-panel').textContent()), /[㐀-鿿]/);
  assert.match(present(await page.locator('#impact-toggle').textContent()), /Outside-scope impact/);
  await page.locator('#theme').click();
  await page.screenshot({ path: path.join(output, 'desktop-impact.png'), fullPage: true });
  await page.locator('#activity-latest').click();
  assert.equal(await page.locator('#map .activity-target').count(), 0);
  await page.locator('#show-details').click();
  assert.match(present(await page.locator('#activity-details').textContent()), /not-run/);
  await page.locator('#activity-step').selectOption('3');
  assert.match(present(await page.locator('#activity-targets').textContent()), /Verification targets/);
  assert.equal(await page.locator('#map .activity-target').count(), present(events[3]).targets.length);
  await page.locator('[data-view="architecture"]').click();
  assert.equal(await page.locator('#map .activity-outside').count(), 0);
  // The plan row stays in both views so switching never moves the map.
  assert.equal(await page.locator('#activity-summary').isVisible(), true);
  await page.locator('[data-view="activity"]').click();
  // One side slot: the open inspector holds it and hands it back to the impact list on close.
  assert.equal(await page.locator('#impact-toggle').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#impact-panel').isVisible(), false);
  assert.equal(await page.locator('#activity-context').count(), 0);
  await page.locator('#close-details').click();
  assert.equal(await page.locator('#impact-panel').isVisible(), true);
  await page.locator('#impact-toggle').click();
  assert.equal(await page.locator('#impact-panel').isVisible(), false);
  await page.locator('#activity-step').selectOption('0');
  assert.equal(await page.locator('#impact-panel').isVisible(), false);
  await page.locator('#language').selectOption('zh');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('#activity-summary').isVisible(), true);
  await page.locator('#activity-disclosure summary').click();
  assert.equal(await page.locator('#activity-details').isVisible(), true);
  await page.screenshot({ path: path.join(output, 'mobile-changes-details.png') });
  await page.locator('#activity-disclosure summary').click();
  await page.locator('#impact-toggle').click();
  await page.locator('#fit').click();
  const stacked = await page.evaluate(() => {
    const mapPane = document.querySelector('.map-pane')?.getBoundingClientRect(), panel = document.getElementById('impact-panel')?.getBoundingClientRect();
    if (!mapPane || !panel) throw new Error('Missing impact layout');
    return { mapHeight: mapPane.height, mapBottom: mapPane.bottom, panelTop: panel.top };
  });
  assert.ok(stacked.panelTop >= stacked.mapBottom && stacked.mapHeight > 120, JSON.stringify(stacked));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(output, 'mobile-impact.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator('[data-view="activity"]').click();
  await page.locator('#theme').click();
  await page.screenshot({ path: path.join(output, 'desktop-changes.png'), fullPage: true });
  await load(map, events, false);
  assert.equal(await page.locator('#activity-step').inputValue(), String(events.length - 1));
  for (const phase of ['failed', 'cancelled'] as const) {
    const terminalEvents = structuredClone(events);
    present(terminalEvents.at(-1)).phase = phase;
    await page.goto('about:blank');
    await load(map, terminalEvents, false);
    assert.equal(await page.locator('#map .activity-target').count(), 0);
  }
  await load(architecture(read('bilingual.architecture.json')), [], false);
  assert.equal(await page.locator('.activity-panel').isVisible(), false);
  assert.equal(await page.locator('#impact-panel').isVisible(), false);
  await page.locator('#language').selectOption('en');
  await page.locator('#nodes .node').first().click();
  assert.equal(await page.locator('aside').isVisible(), true);
  assert.deepEqual(errors, []);
  console.log(`Browser checks passed. Screenshots: ${output}`);
} finally {
  await browser.close();
}
