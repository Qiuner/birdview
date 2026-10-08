import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { discoverConstraints } from '../src/discover-constraints.mjs';
import { renderConstraintCatalog } from '../src/render-constraints.mjs';
import { compileConstraintRules } from '../src/compile-constraint-rules.mjs';
import { constraintRoles } from '../src/constraint-rule-view.mjs';
import { collectRuleHistory } from '../src/constraint-rule-history.mjs';
import { renderArchitecture } from '../src/render.mjs';
import type { ConstraintGraph, ConstraintRule } from '../src/constraint-types.mjs';

test('discovers reference closure, records exclusions, ignores fenced examples and separates review', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'birdview-catalog-'));
  try {
    const files = {
      'AGENTS.md': '# Rules\n\n[Policy](docs/policy.md)\n[Missing](missing.md)\n[Fixture](tests/fixtures/AGENTS.md)\n[Old](docs/archived/old.md)\n',
      'CLAUDE.md': 'AGENTS.md',
      'docs/policy.md': '# Policy\n## Invariant\nAlways check.\n[Root](../AGENTS.md)\n[中文](policy.zh.md)\n```md\n## Not a section\n[Fake](fake.md)\n```\n',
      'docs/policy.zh.md': '# 规范\n',
      'tests/fixtures/AGENTS.md': '# Fixture rules\n',
      'docs/archived/old.md': '# Historical\n',
      '.agents/skills/review/SKILL.md': '---\nname: review\n---\n# Review\nDo checks.\n',
    };
    for (const [file, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), text);
    }
    const git = (...args: string[]): string => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true });
    git('init', '-q'); git('add', '.');
    const aliasHash = git('hash-object', 'CLAUDE.md').trim();
    git('update-index', '--cacheinfo', `120000,${aliasHash},CLAUDE.md`);
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture');
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Uncommitted replacement');
    const rootAlias = process.platform === 'win32' ? root.replace(/^([A-Z]):/, (_, drive: string) => `${drive.toLowerCase()}:`) : root;
    assert.doesNotThrow(() => discoverConstraints(rootAlias));
    assert.throws(() => discoverConstraints(path.join(root, 'docs')), /repository root/);
    const catalog = discoverConstraints(root, { title: '</script><script>bad()</script>' });
    assert.equal(catalog.sources.length, 3);
    assert.equal(catalog.coverage.semanticReview, 'pending');
    assert.equal(catalog.coverage.excluded.length, 4);
    assert.equal(catalog.coverage.excluded.find(item => item.path === 'CLAUDE.md')?.target, 'AGENTS.md');
    assert.equal(catalog.coverage.unresolved.length, 1);
    assert.equal(catalog.sources.find(source => source.path === 'docs/policy.md')?.sections.length, 2);
    assert.ok(catalog.sources.find(source => source.path === 'AGENTS.md')?.text.includes('[Policy]'));
    assert.ok(catalog.sources.every(source => source.history.version === 1));
    const bounded = discoverConstraints(root, { maxSources: 1 });
    assert.ok(bounded.coverage.uninspectedPaths.length > 0);
    const shell = '<html><head></head><body></body></html>';
    assert.throws(() => renderConstraintCatalog(catalog, shell), /requires reviewed rules/);
    const selection = { revision: catalog.project.revision, scope: 'Policy only', groups: [{ sourcePath: 'docs/policy.md', category: 'testing',
      topic: { id: 'checks', name: '检查证据' }, rules: [{ id: 'rule-check', name: '执行相关检查', anchor: 'Always check.',
        condition: '发生改动时', explanation: '执行与改动相关的检查。', verification: '核对命令和退出码。' }] }] };
    const reviewed = compileConstraintRules(catalog, selection);
    const map = JSON.parse(fs.readFileSync(new URL('../examples/system.architecture.json', import.meta.url), 'utf8'));
    const integrated = { ...reviewed, project: { ...reviewed.project, name: map.project.name } };
    const combined = renderArchitecture(map, [], { constraintCatalog: integrated });
    assert.ok(combined.includes('project-views'));
    assert.ok(!combined.includes('<script>bad()'));
    assert.throws(() => renderArchitecture(map, [], { constraintCatalog: reviewed }), /project names differ/);
    const linked = { ...integrated, rules: integrated.rules.map(rule => ({ ...rule, modules: [map.modules[0].id] })) };
    assert.throws(() => renderArchitecture(map, [], { constraintCatalog: linked }), /Invalid module binding/);
    linked.architectureBinding = { mapId: map.mapId, mapRevision: map.revision, sourceRevision: catalog.project.revision };
    assert.doesNotThrow(() => renderArchitecture(map, [], { constraintCatalog: linked }));
    linked.architectureBinding.mapRevision++;
    assert.throws(() => renderArchitecture(map, [], { constraintCatalog: linked }), /Stale architecture binding/);
    linked.architectureBinding.mapRevision--;
    linked.rules[0]!.modules = ['not-a-module'];
    assert.throws(() => renderArchitecture(map, [], { constraintCatalog: linked }), /Invalid module binding/);
    assert.equal(reviewed.rules[0]!.line, 3);
    assert.throws(() => compileConstraintRules(catalog, { ...selection, revision: 'wrong' }), /snapshot differ/);
    const ruleHtml = renderConstraintCatalog(reviewed, shell);
    const rulePayload = JSON.parse(ruleHtml.match(/id="birdview-constraint-data">([\s\S]*?)<\/script>/)?.[1] ?? 'null') as ConstraintGraph;
    assert.equal(rulePayload.nodes.length, 4);
    assert.equal('sourceHref' in rulePayload, false);
    const sourceNodes = rulePayload.directoryNodes!.filter(node => node.id.startsWith('directory-source-'));
    assert.equal(sourceNodes.length, catalog.sources.length);
    assert.ok(sourceNodes.some(node => rulePayload.documents[node.id]?.body.includes('> Always check.')));
    const catalogFile = path.join(root, 'reviewed.json');
    const standalone = path.join(root, 'rules.html');
    const combinedFile = path.join(root, 'combined.html');
    const mapFile = path.join(root, 'map.json');
    fs.writeFileSync(catalogFile, JSON.stringify(reviewed));
    const cli = fileURLToPath(new URL('../scripts/render-constraints.mjs', import.meta.url));
    const run = (...args: string[]) => execFileSync(process.execPath, [cli, catalogFile, standalone, ...args], { encoding: 'utf8', stdio: 'pipe' });
    assert.throws(() => run('--sources'), /--sources was removed/);
    assert.equal(fs.existsSync(standalone), false);
    run();
    assert.equal(fs.existsSync(path.join(root, 'rules.sources.html')), false);
    fs.writeFileSync(path.join(root, 'rules.sources.html'), 'old local page');
    run();
    assert.equal(fs.readFileSync(path.join(root, 'rules.sources.html'), 'utf8'), 'old local page');
    fs.writeFileSync(catalogFile, JSON.stringify(integrated));
    fs.writeFileSync(mapFile, JSON.stringify(map));
    execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/render.mjs', import.meta.url)), mapFile, combinedFile, '--constraints', catalogFile], { stdio: 'pipe' });
    assert.equal(fs.existsSync(combinedFile), true);
    assert.equal(fs.existsSync(path.join(root, 'combined.sources.html')), false);
    assert.ok(rulePayload.documents['rule-check']?.body.includes('> Always check.'));
    assert.ok(!rulePayload.nodes.some(node => node.title === 'AGENTS.md'));
    assert.ok(ruleHtml.includes('cv-legend'));
    assert.ok(!ruleHtml.includes('<iframe'));
    assert.ok(ruleHtml.includes('--cv-role-accent'));
    const architecture = fs.readFileSync(new URL('../assets/architecture.html', import.meta.url), 'utf8');
    for (const role of Object.values(constraintRoles)) {
      for (const token of [...role.dark, ...role.light]) assert.ok(architecture.includes(token), `Architecture palette missing ${token}`);
    }
    Reflect.set(reviewed.rules[0]!, 'targetRole', 'testing');
    assert.throws(() => renderConstraintCatalog(reviewed, shell), /Unknown targetRole/);
    reviewed.rules[0]!.targetRole = 'frontend';
    assert.throws(() => renderConstraintCatalog(reviewed, shell), /requires evidence/);
    reviewed.rules[0]!.roleReason = 'Fixture role evidence';
    assert.ok(renderConstraintCatalog(reviewed, shell).includes('R001 · 版本未追踪 · 前端'));
    const versioned = collectRuleHistory(reviewed, root);
    assert.equal(versioned.rules[0]!.history?.status === 'tracked' ? versioned.rules[0]!.history.version : undefined, 1);
    const versionHtml = renderConstraintCatalog(versioned, shell);
    assert.ok(versionHtml.includes('R001 · v1 · 前端'));
    assert.ok(versionHtml.includes('规则原文版本'));
    if (versioned.rules[0]!.history) versioned.rules[0]!.history.snapshot = '0'.repeat(40);
    assert.throws(() => renderConstraintCatalog(versioned, shell), /Invalid rule history/);
    assert.ok(ruleHtml.includes('R001'));
    assert.ok(!ruleHtml.includes('<script>bad()'));
    const clone = path.join(root, 'shallow-copy');
    git('clone', '-q', '--depth=1', pathToFileURL(root).href, clone);
    const shallow = discoverConstraints(clone);
    assert.equal(shallow.coverage.shallow, true);
    assert.ok(shallow.sources.every(source => source.history.version === null));
    const shallowHistory = collectRuleHistory(reviewed, clone).rules[0]!.history;
    assert.equal(shallowHistory?.status === 'untracked' ? shallowHistory.reason : undefined, 'shallow-history');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
