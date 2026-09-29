import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { deliver, type DeliveryReceipt } from '../src/deliver.mjs';
import { discoverConstraints } from '../src/discover-constraints.mjs';
import { renderArchitecture } from '../src/render.mjs';
import { renderConstraintCatalog } from '../src/render-constraints.mjs';
import type { Architecture } from '../src/contracts/models.mjs';
import type { ReviewedConstraintCatalog } from '../src/constraint-types.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const example = path.join(root, 'examples/architecture.json');
const activity = path.join(root, 'examples/activity.jsonl');
const cli = path.join(root, 'scripts/birdview.mjs');
// Freshness records the invocation time; every other rendered byte must match.
const htmlDigest = (html: string) => createHash('sha256').update(html.replace(/("constraintFreshness":{"checkedAt":)"[^"]+"/, '$1"<time>"')).digest('hex');

test('delivery CLI validates strict authoring and activity and keeps existing rendering', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'birdview-deliver-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const output = path.join(dir, 'nested/map.html');
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, 'deliver', ...args], { cwd: dir, encoding: 'utf8' });
  const result = run(example, output, activity, '--architecture-only');
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const report = JSON.parse(result.stdout) as DeliveryReceipt;
  assert.equal(report.ok, true);
  assert.equal(report.stage, 'complete');
  assert.equal(report.visualReview, 'not-performed');
  assert.equal(report.implementationVerification, 'unverified');
  assert.deepEqual(report.written, [output]);
  const map = JSON.parse(fs.readFileSync(example, 'utf8')) as Architecture;
  const events = fs.readFileSync(activity, 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line));
  const expected = renderArchitecture(map, events);
  assert.equal(fs.readFileSync(output, 'utf8'), expected);
  const bilingual = run(example, output, '--architecture-only', '--bilingual');
  assert.equal(bilingual.status, 1);
  assert.equal((JSON.parse(bilingual.stdout) as DeliveryReceipt).stage, 'validate');
  assert.equal(fs.readFileSync(output, 'utf8'), expected);
  const bilingualMap = path.join(root, 'examples/system.architecture.json');
  const translated = run(bilingualMap, output, '--architecture-only', '--bilingual', '--legacy');
  assert.equal(translated.status, 0, translated.stdout + translated.stderr);

  const legacy = path.join(dir, 'legacy.json');
  map.modules.forEach(module => { delete module.role; delete module.roleAssessment; });
  fs.writeFileSync(legacy, JSON.stringify(map));
  const rejected = deliver([legacy, output, '--architecture-only']);
  assert.equal(rejected.stage, 'validate');
  assert.ok(rejected.validation?.errors.some(error => error.code === 'role/required'));
  const accepted = deliver([legacy, output, '--architecture-only', '--legacy']);
  assert.equal(accepted.ok, true, accepted.error);
  assert.ok(accepted.validation && 'warnings' in accepted.validation && accepted.validation.warnings.some(warning => warning.code === 'role/all-generic-review'));
});

test('delivery compiles reviewed rules, collects real history and reuses catalogs without changing the view', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'birdview-deliver-rules-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', windowsHide: true });
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Rules\n\nRun the relevant checks.\n');
  git('init', '-q'); git('add', 'AGENTS.md');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture');
  const map = JSON.parse(fs.readFileSync(example, 'utf8')) as Architecture;
  const catalog = discoverConstraints(dir, { title: map.project.name });
  const selection = { revision: catalog.project.revision, scope: 'Root test instruction',
    architectureBinding: { mapId: map.mapId, mapRevision: map.revision, sourceRevision: catalog.project.revision },
    groups: [{ sourcePath: 'AGENTS.md', category: 'testing', rules: [{ id: 'check', name: 'Run relevant checks',
      anchor: 'Run the relevant checks.', condition: 'After changes', explanation: 'Detect regressions.', verification: 'Read command results.' }] }] };
  const source = path.join(dir, 'catalog.json'), rules = path.join(dir, 'rules.json');
  const output = path.join(dir, 'project.html');
  const args = [example, output, '--catalog', source, '--rules', rules, '--repo', dir];
  fs.writeFileSync(source, JSON.stringify(catalog));
  fs.writeFileSync(rules, JSON.stringify(selection));
  const report = deliver(args);
  assert.equal(report.ok, true, report.error);
  assert.deepEqual(report.constraints?.historyGaps, []);
  assert.equal(report.constraints?.rules, 1);
  assert.equal(report.written.length, 3);
  const compiled = JSON.parse(fs.readFileSync(report.outputs!.constraints!, 'utf8')) as ReviewedConstraintCatalog;
  assert.equal(compiled.ruleReview.implementationVerification, 'unverified');
  assert.equal(compiled.rules[0]!.history?.status, 'tracked');
  const expected = renderArchitecture(map, [], { repository: dir, constraintCatalog: compiled, constraintSourceHref: 'project.sources.html' });
  assert.equal(htmlDigest(fs.readFileSync(output, 'utf8')), htmlDigest(expected));
  assert.equal(fs.readFileSync(report.outputs!.sources!, 'utf8'), renderConstraintCatalog(compiled, undefined, { view: 'sources' }));
  assert.equal(fs.readFileSync(source, 'utf8'), JSON.stringify(catalog));
  assert.equal(fs.readFileSync(rules, 'utf8'), JSON.stringify(selection));
  assert.equal(deliver([example, output, '--constraints', report.outputs!.constraints!, '--repo', dir]).ok, true);
  assert.equal(htmlDigest(fs.readFileSync(output, 'utf8')), htmlDigest(expected));

  const saved = new Map(report.written.map(file => [file, fs.readFileSync(file, 'utf8')]));
  const unchanged = () => saved.forEach((content, file) => assert.equal(fs.readFileSync(file, 'utf8'), content));
  selection.groups[0]!.rules[0]!.anchor = 'Missing anchor';
  fs.writeFileSync(rules, JSON.stringify(selection));
  assert.equal(deliver(args).stage, 'compile'); unchanged();
  selection.groups[0]!.rules[0]!.anchor = 'Run the relevant checks.';
  selection.architectureBinding.mapRevision++;
  fs.writeFileSync(rules, JSON.stringify(selection));
  assert.match(deliver(args).error!, /Stale architecture binding/); unchanged();
  selection.architectureBinding.mapRevision--;
  fs.writeFileSync(rules, JSON.stringify(selection));
  catalog.sources[0]!.text += '\nChanged snapshot text';
  fs.writeFileSync(source, JSON.stringify(catalog));
  assert.equal(deliver(args).stage, 'history'); unchanged();

  delete compiled.rules[0]!.history;
  fs.writeFileSync(rules, JSON.stringify(compiled));
  const untracked = deliver([example, output, '--constraints', rules]);
  assert.equal(untracked.ok, true, untracked.error);
  assert.deepEqual(untracked.constraints?.historyGaps, ['check']);

  const previousPage = fs.readFileSync(output, 'utf8');
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from: fs.PathLike, to: fs.PathLike) => {
    if (to === output) throw new Error('Simulated publication failure');
    rename(from, to);
  });
  const interrupted = deliver([example, output, '--constraints', rules]);
  assert.equal(interrupted.ok, false);
  assert.equal(interrupted.stage, 'write');
  assert.match(interrupted.error!, /publication failure/);
  assert.deepEqual(interrupted.written, [report.outputs!.sources!]);
  assert.equal(fs.readFileSync(output, 'utf8'), previousPage);
  assert.ok(!fs.readdirSync(dir).some(file => file.endsWith('.tmp')));
});

test('invalid options, JSON, event bindings, and path aliases preserve output and inputs', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'birdview-deliver-invalid-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const output = path.join(dir, 'project.html'), bad = path.join(dir, 'bad.json');
  fs.writeFileSync(output, 'existing page');
  fs.writeFileSync(bad, '{broken}');
  const cases = [[], [example, output], [example, output, '--wat'],
    [example, output, '--architecture-only', '--architecture-only'],
    [example, output, '--architecture-only', '--constraints', bad],
    [example, output, '--catalog', bad, '--rules', bad],
    [bad, output, '--architecture-only'], [example, output, bad, '--architecture-only'],
    [example, output, '--constraints', bad], [example, output, '--repo'],
    [example, output, output, '--architecture-only'], [output, output, '--architecture-only']];
  for (const args of cases) {
    const failed = deliver(args);
    assert.equal(failed.ok, false, JSON.stringify(args));
    assert.deepEqual(failed.written, []);
    assert.equal(fs.readFileSync(output, 'utf8'), 'existing page');
  }
  fs.writeFileSync(bad, 'null');
  assert.equal(deliver([bad, output, '--architecture-only']).stage, 'validate');
  assert.equal(deliver([bad, output, '--architecture-only', '--legacy']).stage, 'validate');
  assert.match(deliver([example, output, '--constraints', bad]).error!, /reviewed catalog/);
  const events = fs.readFileSync(activity, 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line));
  events[0].mapRevision = 999;
  fs.writeFileSync(bad, events.map(event => JSON.stringify(event)).join('\n'));
  assert.equal(deliver([example, output, bad, '--architecture-only']).stage, 'validate');
  assert.equal(fs.readFileSync(output, 'utf8'), 'existing page');
  const alias = path.join(dir, 'input.json');
  fs.linkSync(output, alias);
  assert.match(deliver([alias, output, '--architecture-only']).error!, /aliases input/);
  const sidecar = path.join(dir, 'project.sources.html');
  fs.copyFileSync(example, sidecar);
  assert.match(deliver([sidecar, output, '--constraints', bad]).error!, /aliases input/);
  assert.equal(fs.readFileSync(sidecar, 'utf8'), fs.readFileSync(example, 'utf8'));
  fs.rmSync(sidecar); fs.mkdirSync(sidecar);
  assert.match(deliver([example, output, '--constraints', bad]).error!, /regular file/);
  assert.equal(fs.readFileSync(output, 'utf8'), 'existing page');
});

test('delivery rejects input aliases through linked parent directories', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'birdview-deliver-link-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const actual = path.join(dir, 'actual'), linked = path.join(dir, 'linked');
  fs.mkdirSync(actual);
  fs.symlinkSync(actual, linked, process.platform === 'win32' ? 'junction' : 'dir');
  const input = path.join(actual, 'map.html');
  fs.copyFileSync(example, input);
  const report = deliver([input, path.join(linked, 'map.html'), '--architecture-only']);
  assert.equal(report.ok, false);
  assert.match(report.error!, /aliases input/);
  assert.equal(fs.readFileSync(input, 'utf8'), fs.readFileSync(example, 'utf8'));
});
