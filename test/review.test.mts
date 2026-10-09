import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { renderReview, validateReview, verifyReviewQuotes } from '../src/render-review.mjs';
import type { ArchitectureReview } from '../src/contracts/models.mjs';
const fixture = (): ArchitectureReview => JSON.parse(fs.readFileSync('examples/review.json', 'utf8')) as ArchitectureReview;
const first = (r: ArchitectureReview) => r.candidates[0]!;
const deepOf = (r: ArchitectureReview) => first(r).after.nodes.find(n => n.kind === 'deep')!;
// Any edit that changes the cited text; the example's wording is free to change.
const alter = (quote: string): string => `${quote} // altered`;

test('review contract rejects dangling marks, misplaced deep modules and unsupported claims', () => {
  validateReview(fixture());
  for (const mutate of [
    (r: ArchitectureReview) => { first(r).findings[0]!.targets = ['missing']; },
    (r: ArchitectureReview) => { first(r).findings[0]!.evidence = [99]; },
    (r: ArchitectureReview) => { first(r).before.nodes[0]!.kind = 'deep'; },
    (r: ArchitectureReview) => { first(r).before.nodes.find(n => n.kind === 'module')!.evidence = []; },
    (r: ArchitectureReview) => { deepOf(r).absorbs = ['missing']; },
    (r: ArchitectureReview) => { delete deepOf(r).absorbs; },
    (r: ArchitectureReview) => { const [a, b] = first(r).before.nodes; b!.row = a!.row; b!.column = a!.column; },
    (r: ArchitectureReview) => { const [a, b] = first(r).after.nodes; b!.row = a!.row; b!.column = a!.column; },
    (r: ArchitectureReview) => { first(r).before.edges[0]!.to = 'missing'; },
    (r: ArchitectureReview) => { first(r).strength = 'strong'; first(r).findings.forEach(f => { f.confidence = 'hypothesis'; }); },
    (r: ArchitectureReview) => { first(r).evidence[0]!.lines.end += 1; },
    (r: ArchitectureReview) => { first(r).evidence[0]!.path = '../outside.css'; },
    (r: ArchitectureReview) => { r.recommendation = { candidate: 'missing', reason: 'x' }; },
    (r: ArchitectureReview) => { first(r).findings[0]!.note = '这条红笔批注已经长得放不进图纸里面了'; }
  ]) { const r = fixture(); mutate(r); assert.throws(() => validateReview(r)); }
  const strong = fixture(); first(strong).strength = 'strong'; validateReview(strong);
});

test('quotes are checked against the cited lines of the reviewed commit or working tree', () => {
  const r = fixture();
  const statuses = verifyReviewQuotes(r, '.');
  assert.ok(statuses[0]!.every(s => s.state === 'verified'));
  const changed = fixture(); first(changed).evidence[0]!.quote = alter(first(changed).evidence[0]!.quote);
  assert.throws(() => verifyReviewQuotes(changed, '.'), /do not match/);
  const missing = fixture(); first(missing).evidence[0]!.path = 'assets/missing.css';
  assert.throws(() => verifyReviewQuotes(missing, '.'), /not found/);
  // Without a usable commit the working tree is the source, and that is reported.
  const local = fixture(); local.sourceRevision = 'not-a-commit';
  local.candidates = [first(local)];
  first(local).evidence = [{ path: 'src/render.mts', lines: { start: 1, end: 1 },
    quote: fs.readFileSync('src/render.mts', 'utf8').split(/\r?\n/)[0]!, note: 'Working-tree fallback' }];
  assert.ok(verifyReviewQuotes(local, '.')[0]!.every(s => s.source === 'worktree'));
});

test('quotes of uncommitted edits to tracked files pass against the working tree', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-dirty-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args: string[]) => spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
  git('init', '-q'); fs.writeFileSync(path.join(dir, 'a.ts'), 'const a = 1;\n'); git('add', '.'); git('commit', '-qm', 'a');
  fs.writeFileSync(path.join(dir, 'a.ts'), 'const a = 2;\n');
  const r = fixture(); r.candidates = [first(r)]; r.sourceRevision = git('rev-parse', 'HEAD').stdout.trim();
  first(r).evidence = [{ path: 'a.ts', lines: { start: 1, end: 1 }, quote: 'const a = 1;', note: '提交里' }, { path: 'a.ts', lines: { start: 1, end: 1 }, quote: 'const a = 2;', note: '工作区里' }];
  assert.deepEqual(verifyReviewQuotes(r, dir)[0]!.map(s => s.source), ['commit', 'worktree']);
  first(r).evidence[1]!.quote = 'const a = 3;';
  assert.throws(() => verifyReviewQuotes(r, dir), /a\.ts:1-1 \(commit, worktree\)/);
});

test('drawings drop empty leading cells and wrap absorbed chips instead of squeezing labels', () => {
  const svg = (r: ArchitectureReview) => renderReview(r).match(/<svg[\s\S]*?<\/svg>/g)!.join('');
  const shifted = fixture();
  for (const side of ['before', 'after'] as const) for (const n of first(shifted)[side].nodes) { n.row += 2; n.column += 2; }
  assert.equal(svg(shifted), svg(fixture()));
  const crowded = fixture(); crowded.candidates = [first(crowded)];
  const deep = deepOf(crowded);
  for (const n of first(crowded).before.nodes) n.label = `一个相当长的现状节点${n.id}`;
  deep.absorbs = first(crowded).before.nodes.map(n => n.id).slice(0, 5);
  const html = renderReview(crowded), box = html.match(/<rect class="deep"[^>]*height="(\d+)"/)!;
  assert.ok(Number(box[1]) > 92, 'deep module grows for a second chip line');
  assert.equal((html.match(/<rect class="inner"/g) ?? []).length, 5);
});

test('review page escapes source, marks unchecked quotes and supports no candidates', () => {
  const r = fixture(); first(r).evidence[0]!.quote = '</script><img src=x onerror=alert(1)>';
  const html = renderReview(r);
  assert.ok(html.includes('&lt;/script&gt;&lt;img'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('未核对'));
  const checked = renderReview(fixture(), { quotes: verifyReviewQuotes(fixture(), '.') });
  assert.ok(checked.includes('已与源码核对'));
  assert.equal((checked.match(/class="red/g) ?? []).length > 0, true);
  const empty = fixture(); empty.language = 'en'; empty.candidates = []; empty.recommendation = null;
  assert.ok(renderReview(empty).includes('No sufficiently supported improvement candidates'));
});

test('review CLI verifies quotes with --repo and keeps output on failure', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const input = path.join(dir, 'review.json'), output = path.join(dir, 'review.html');
  const run = () => spawnSync(process.execPath, ['scripts/render-review.mjs', input, output, '--repo', '.'], { encoding: 'utf8' });
  fs.writeFileSync(input, JSON.stringify(fixture()));
  assert.equal(run().status, 0);
  const saved = fs.readFileSync(output, 'utf8');
  const r = fixture(); first(r).evidence[1]!.quote = alter(first(r).evidence[1]!.quote);
  fs.writeFileSync(input, JSON.stringify(r));
  const failed = run();
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /do not match/);
  assert.equal(fs.readFileSync(output, 'utf8'), saved);
});

test('integrated CLI checks bindings and preserves output on invalid review', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const map = JSON.parse(fs.readFileSync('examples/architecture.json', 'utf8')) as { mapId: string; revision: number; project: { name: string; revision?: string }; modules: { id: string }[] };
  const r = fixture(); r.project = map.project.name; r.architectureBinding = { mapId: map.mapId, revision: map.revision };
  if (map.project.revision) r.sourceRevision = map.project.revision;
  const input = path.join(dir, 'review.json'), output = path.join(dir, 'map.html');
  fs.writeFileSync(input, JSON.stringify(r));
  const run = () => spawnSync(process.execPath, ['scripts/render.mjs', 'examples/architecture.json', output, '--review', input], { encoding: 'utf8' });
  assert.equal(run().status, 0);
  // Both pages share the project-view switcher: the map knows its review page and the review links back.
  assert.ok(fs.readFileSync(output, 'utf8').includes('"reviewHref":"map.review.html"'));
  assert.ok(fs.readFileSync(path.join(dir, 'map.review.html'), 'utf8').includes('<a href="map.html">'));
  const saved = fs.readFileSync(output, 'utf8');
  first(r).modules = ['missing-module']; fs.writeFileSync(input, JSON.stringify(r));
  assert.equal(run().status, 1);
  first(r).modules = []; r.architectureBinding.revision += 1; fs.writeFileSync(input, JSON.stringify(r));
  assert.equal(run().status, 1);
  assert.equal(fs.readFileSync(output, 'utf8'), saved);
});
