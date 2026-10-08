import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderReview, verifyReviewQuotes } from '../src/render-review.mjs';
import type { ArchitectureReview } from '../src/contracts/models.mjs';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const r = JSON.parse(fs.readFileSync('examples/review.json', 'utf8')) as ArchitectureReview;
  assert.ok(r.candidates.length >= 2, 'the example shows several sheets');
  r.recommendation = { candidate: r.candidates[1]!.id, reason: '用于测试跳转。' };
  const shared = r.candidates[0]!.before.nodes.find(n => r.candidates[0]!.after.nodes.some(a => a.id === n.id && a.kind !== 'deep'))!.id;
  const quotes = verifyReviewQuotes(r, '.');
  for (const language of ['zh', 'en'] as const) {
    r.language = language;
    await page.setContent(renderReview(r, { quotes }));
    assert.equal(await page.locator('.sheet-page:visible').count(), 1);
    const sheet = page.locator('.sheet-page:visible');
    // Red pencil: one numbered note per finding and margin notes for caller knowledge.
    assert.ok(await sheet.locator('svg .red').count() >= r.candidates[0]!.findings.length);
    assert.equal(await sheet.locator('.findings li').count(), r.candidates[0]!.findings.length);
    assert.equal(await sheet.locator('.margin-notes li').count(), r.candidates[0]!.callerKnowledge.before.length + r.candidates[0]!.callerKnowledge.after.length);
    assert.equal(await sheet.locator('.slip .verified').count(), r.candidates[0]!.evidence.length);
    // The same id in both drawings lights up together.
    await sheet.locator(`.node[data-node="${shared}"]`).first().hover();
    assert.equal(await sheet.locator('.node.linked').count(), 2);
    // Recommendation and tabs switch sheets.
    await page.locator('.recommend [data-goto]').click();
    assert.equal(await page.locator('.sheet-page[data-sheet="1"]').isVisible(), true);
    assert.equal(await page.locator('.tabs [data-goto="1"]').getAttribute('aria-pressed'), 'true');
    await page.locator('.tabs [data-goto="0"]').click();
    assert.equal(await page.locator('.sheet-page[data-sheet="0"]').isVisible(), true);
    // Theme follows the shared Birdview setting.
    await page.locator('.theme-toggle').click();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
    await page.locator('.theme-toggle').click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  assert.deepEqual(errors, []);
  console.log('Review desktop/mobile, Chinese/English, red-pencil marks, verified quotes, linked drawings, sheets and theme checks passed.');
} finally { await browser.close(); }
