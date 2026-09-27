import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditSkills, readAssessment, renderAuditMarkdown } from '../src/skill-audit.mjs';

test('skill audit discovers manifests, symlinks, duplicates and metadata flags', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'birdview-skill-audit-'));
  const project = path.join(root, 'project'), user = path.join(root, 'user');
  fs.mkdirSync(path.join(project, '.agents', 'skills', 'one'), { recursive: true });
  fs.mkdirSync(path.join(user, '.agents', 'skills', 'two'), { recursive: true });
  fs.writeFileSync(path.join(project, '.agents', 'skills', 'one', 'SKILL.md'), '---\nname: shared\ndescription: Help with everything.\n---\n');
  fs.writeFileSync(path.join(user, '.agents', 'skills', 'two', 'SKILL.md'), '---\nname: shared\ndescription: A focused database migration workflow for SQL projects.\n---\n');
  const original = process.env.USERPROFILE; process.env.USERPROFILE = user;
  try {
    const report = auditSkills(project);
    assert.equal(report.skills.length, 2);
    assert.deepEqual(report.duplicateNames.length, 1);
    assert.ok(report.skills.some(skill => skill.issues.includes('broad-trigger')));
    assert.ok(report.skills.every(skill => /^[a-f0-9]{64}$/.test(skill.digest)));
    assert.equal(report.assessment.status, 'unreviewed');
    const assessment = path.join(root, 'assessment.json');
    const input = { status: 'reviewed', reviewedAt: new Date().toISOString(), reviewer: 'test', summary: 'Test fixture, not a real conclusion.', conclusions: [{ leftSkill: 'shared', rightSkill: 'shared', relation: 'ordered', confidence: 'high', scenario: 'Both copies are selected.', impact: 'Duplicate workflow execution.', rationale: 'Test only.', evidence: report.skills.map(skill => ({ skill: skill.name, path: skill.path, digest: skill.digest, quote: skill.description })), recommendation: 'Run one before two.' }] };
    fs.writeFileSync(assessment, JSON.stringify(input));
    const reviewed = { ...report, assessment: readAssessment(assessment, report, project) };
    assert.match(renderAuditMarkdown(reviewed), /Human conclusion: reviewed/);
    assert.match(renderAuditMarkdown(reviewed), /Run one before two/);
    const conclusion = input.conclusions[0]!;
    conclusion.evidence.pop();
    fs.writeFileSync(assessment, JSON.stringify(input));
    assert.throws(() => readAssessment(assessment, report, project), /both skill files/);
    conclusion.relation = 'unresolved';
    fs.writeFileSync(assessment, JSON.stringify(input));
    assert.equal(readAssessment(assessment, report, project).conclusions[0]?.relation, 'unresolved');
    conclusion.evidence[0]!.quote = 'Invented quote';
    fs.writeFileSync(assessment, JSON.stringify(input));
    assert.throws(() => readAssessment(assessment, report, project), /quote does not match/);
    conclusion.evidence[0]!.digest = 'stale';
    fs.writeFileSync(assessment, JSON.stringify(input));
    assert.throws(() => readAssessment(assessment, report, project), /stale/);
  } finally { process.env.USERPROFILE = original; fs.rmSync(root, { recursive: true, force: true }); }
});
