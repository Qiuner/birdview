import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

export type CompatibilityRelation = 'compatible' | 'ordered' | 'potential-conflict' | 'unresolved';
export interface CompatibilityEvidence { skill: string; path: string; digest: string; quote: string }
export interface CompatibilityConclusion {
  leftSkill: string;
  rightSkill: string;
  relation: CompatibilityRelation;
  confidence: 'high' | 'medium' | 'low';
  scenario: string;
  impact: string;
  rationale: string;
  evidence: CompatibilityEvidence[];
  recommendation: string;
}
export interface HumanAssessment {
  status: 'unreviewed' | 'reviewed';
  reviewedAt?: string;
  reviewer?: string;
  language?: 'en' | 'zh';
  summary?: string;
  conclusions: CompatibilityConclusion[];
}
export interface SkillAuditEntry { name: string; path: string; root: string; description: string; digest: string; issues: string[] }
export interface SkillAuditReport { schemaVersion: '2'; generatedAt: string; roots: string[]; skills: SkillAuditEntry[]; duplicateNames: string[][]; assessment: HumanAssessment; notes: string[] }

const roots = (project = process.cwd()): string[] => [
  ...(process.env.USERPROFILE || os.homedir() ? [path.join(process.env.USERPROFILE || os.homedir(), '.agents', 'skills'), path.join(process.env.USERPROFILE || os.homedir(), '.claude', 'skills'), path.join(process.env.USERPROFILE || os.homedir(), '.dsh', 'skills')] : []),
  process.env.DSH_AGENTS_HOME ? path.join(process.env.DSH_AGENTS_HOME, 'skills') : '',
  path.join(project, '.agents', 'skills'), path.join(project, '.claude', 'skills'), path.join(project, '.dsh', 'skills')
].filter((value, index, values) => value && values.indexOf(value) === index);

function digest(file: string): string { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function frontmatter(text: string): { name: string; description: string } {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const body = match?.[1] ?? '';
  const name = body.match(/^name:\s*["']?([^"'\r\n]+)["']?\s*$/m)?.[1]?.trim() ?? '';
  const description = body.match(/^description:\s*["']?([^"'\r\n]+)["']?\s*$/m)?.[1]?.trim() ?? '';
  return { name, description };
}
function findSkillFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const found: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > 4) return;
    const manifest = path.join(dir, 'SKILL.md');
    if (fs.existsSync(manifest) && fs.statSync(manifest).isFile()) { found.push(manifest); return; }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) walk(file, depth + 1);
      else if (entry.isSymbolicLink() && fs.existsSync(path.join(file, 'SKILL.md'))) found.push(path.join(file, 'SKILL.md'));
      else if (entry.isFile() && entry.name === 'SKILL.md') found.push(file);
    }
  };
  walk(root, 0); return found;
}
function issues(name: string, description: string): string[] {
  const result: string[] = [];
  if (!name) result.push('missing-name');
  if (!description) result.push('missing-description');
  const words = description.split(/\s+/).filter(Boolean);
  if (words.length < 8) result.push('short-description');
  if (/\b(any|all|everything|anything|general|help with|assist with)\b/i.test(description)) result.push('broad-trigger');
  return result;
}
export function auditSkills(project = process.cwd()): SkillAuditReport {
  const entries: SkillAuditEntry[] = [], checkedRoots = roots(project).filter(root => fs.existsSync(root));
  for (const root of checkedRoots) for (const file of findSkillFiles(root)) {
    const parsed = frontmatter(fs.readFileSync(file, 'utf8'));
    entries.push({ name: parsed.name || path.basename(path.dirname(file)), path: path.relative(project, file).replaceAll('\\', '/'), root, description: parsed.description, digest: digest(file), issues: issues(parsed.name, parsed.description) });
  }
  const byName = new Map<string, string[]>();
  for (const entry of entries) byName.set(entry.name, [...(byName.get(entry.name) ?? []), entry.path]);
  return { schemaVersion: '2', generatedAt: new Date().toISOString(), roots: checkedRoots, skills: entries.sort((a, b) => a.name.localeCompare(b.name)), duplicateNames: [...byName.values()].filter(paths => paths.length > 1), assessment: { status: 'unreviewed', conclusions: [] }, notes: ['The inventory is deterministic; semantic compatibility requires reading the relevant skill bodies.', 'An unreviewed report must not be treated as evidence that skills conflict or are safe to combine.'] };
}

export function readAssessment(file: string, report: SkillAuditReport, project = process.cwd()): HumanAssessment {
  const value = JSON.parse(fs.readFileSync(file, 'utf8')) as HumanAssessment;
  const nonempty = (text: unknown): text is string => typeof text === 'string' && text.trim().length > 0;
  if (!value || !['unreviewed', 'reviewed'].includes(value.status) || !Array.isArray(value.conclusions)) throw new Error('Assessment must contain status and conclusions[].');
  if (value.language !== undefined && !['en', 'zh'].includes(value.language)) throw new Error('Assessment language must be en or zh.');
  if (value.status === 'unreviewed' && value.conclusions.length) throw new Error('Unreviewed assessment cannot contain conclusions.');
  if (value.status === 'reviewed' && (!nonempty(value.summary) || !nonempty(value.reviewer) || !nonempty(value.reviewedAt) || !Number.isFinite(Date.parse(value.reviewedAt)))) throw new Error('Reviewed assessment requires summary, reviewer and a valid reviewedAt.');
  for (const conclusion of value.conclusions) {
    if (!conclusion || ![conclusion.leftSkill, conclusion.rightSkill, conclusion.scenario, conclusion.impact, conclusion.rationale, conclusion.recommendation].every(nonempty) || !['compatible', 'ordered', 'potential-conflict', 'unresolved'].includes(conclusion.relation) || !['high', 'medium', 'low'].includes(conclusion.confidence) || !Array.isArray(conclusion.evidence)) throw new Error('Each conclusion requires skills, relation, confidence, scenario, impact, rationale, evidence[] and recommendation.');
    if (![conclusion.leftSkill, conclusion.rightSkill].every(name => report.skills.some(skill => skill.name === name))) throw new Error('Conclusion references an undiscovered skill.');
    for (const evidence of conclusion.evidence) {
      if (!evidence || ![evidence.skill, evidence.path, evidence.digest, evidence.quote].every(nonempty)) throw new Error('Evidence requires skill, path, digest and quote.');
      const entry = report.skills.find(skill => skill.path === evidence.path && skill.name === evidence.skill);
      if (!entry || ![conclusion.leftSkill, conclusion.rightSkill].includes(evidence.skill) || entry.digest !== evidence.digest) throw new Error('Evidence is unknown or stale; review the current skill.');
      const source = path.resolve(project, entry.path);
      if (digest(source) !== entry.digest || !fs.readFileSync(source, 'utf8').replace(/\r\n/g, '\n').includes(evidence.quote.replace(/\r\n/g, '\n'))) throw new Error('Evidence quote does not match the current skill.');
    }
    if (conclusion.relation !== 'unresolved' && (![conclusion.leftSkill, conclusion.rightSkill].every(name => conclusion.evidence.some(item => item.skill === name)) || new Set(conclusion.evidence.map(item => item.path)).size < 2)) throw new Error('A resolved relationship requires evidence from both skill files.');
  }
  return value;
}

export function renderAuditMarkdown(report: SkillAuditReport): string {
  const reviewed = report.assessment.status === 'reviewed';
  const zh = report.assessment.language === 'zh';
  const label = (en: string, cn: string): string => zh ? cn : en;
  const safe = (text: string): string => text.replace(/[\r\n]+/g, ' ').replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]!).replace(/[\\`*_{}\[\]()#!|]/g, '\\$&');
  const relations = { compatible: '兼容', ordered: '需要排序', 'potential-conflict': '潜在冲突', unresolved: '未决' };
  const covered = new Set(report.assessment.conclusions.flatMap(item => item.evidence.map(evidence => evidence.path)));
  const lines = [label('# Skill compatibility audit', '# 技能兼容性体检'), '', `${label('Generated', '扫描时间')}: ${report.generatedAt}`, '', label(`## Human conclusion: ${reviewed ? 'reviewed' : 'unreviewed'}`, `## 兼容性结论：${reviewed ? '已提供评估' : '未评估'}`), '', reviewed ? safe(report.assessment.summary ?? '') : label('No semantic conclusion has been reviewed yet. This is an inventory, not a compatibility verdict.', '尚未完成语义评估，当前只有扫描清单，不能据此判断兼容性。'), '', `${label('Discovered skills / files cited / relationships', '发现技能 / 引用正文的文件 / 评估关系')}: ${report.skills.length} / ${covered.size} / ${report.assessment.conclusions.length}`, '', label('Conclusions apply only to the stated scenarios. Discovered does not mean active; citations do not prove all combinations were reviewed.', '结论仅适用于列出的任务场景。已安装不等于当前生效；引用过正文也不代表审查了全部组合。'), '', label('## Relationships', '## 需要关注的关系'), ''];
  if (reviewed) lines.push(`${label('Reviewer / reviewed at', '评估者 / 评估时间')}: ${safe(report.assessment.reviewer ?? '')} / ${safe(report.assessment.reviewedAt ?? '')}`, '');
  const priority = { 'potential-conflict': 0, unresolved: 1, ordered: 2, compatible: 3 };
  for (const item of [...report.assessment.conclusions].sort((a, b) => priority[a.relation] - priority[b.relation])) {
    lines.push(`### ${safe(item.leftSkill)} / ${safe(item.rightSkill)}: ${zh ? relations[item.relation] : item.relation}`, '', `- **${label('Scenario', '发生场景')}:** ${safe(item.scenario)}`, `- **${label('Impact', '实际影响')}:** ${safe(item.impact)}`, `- **${label('Why', '判断依据')}:** ${safe(item.rationale)}`, `- **${label('Recommendation', '建议操作')}:** ${safe(item.recommendation)}`, `- **${label('Confidence (agent estimate)', '置信度（AI 判断）')}:** ${zh ? { high: '高', medium: '中', low: '低' }[item.confidence] : item.confidence}`, '', `**${label('Evidence', '原文证据')}:**`, '');
    for (const evidence of item.evidence) lines.push(`- ${safe(evidence.skill)} (${safe(evidence.path)}): ${safe(evidence.quote)}`);
    lines.push('');
  }
  lines.push(label('## Skills not yet semantically reviewed', '## 已扫描但尚未语义评估的技能'), '');
  const uncovered = report.skills.filter(skill => !covered.has(skill.path));
  for (const skill of uncovered) lines.push(`- ${safe(skill.name)} (${safe(skill.path)})`);
  if (uncovered.length) lines.push('', label('These files were discovered by the scan. They have not yet been read and cited for a semantic relationship conclusion.', '这些文件已经被扫描发现，但尚未被读取并引用到语义关系结论中。'));
  else lines.push(label('All discovered files are cited; this does not establish compatibility of every pair.', '所有已发现文件均被引用，但不代表所有组合都已评估。'));
  lines.push('', label('## Inventory flags (not semantic conflicts)', '## 扫描提示（不等于语义冲突）'), '');
  for (const skill of report.skills.filter(skill => skill.issues.length)) lines.push(`- ${safe(skill.name)} (${safe(skill.path)}): ${skill.issues.join(', ')}`);
  for (const paths of report.duplicateNames) lines.push(`- ${label('Duplicate name', '同名安装')}: ${paths.map(safe).join(' / ')}`);
  lines.push('', label('## Scanned roots and limitations', '## 扫描范围与局限'), '');
  for (const root of report.roots) lines.push(`- ${safe(root)}`);
  lines.push('', label('Only discovered SKILL.md files are covered. Host-injected rules, referenced documents and undiscovered locations require separate inspection. Quotes and digests are validated; semantic conclusions remain AI judgments. No skill configuration was changed.', '仅覆盖已发现的 SKILL.md。宿主注入规则、引用文档和未发现目录需另行核查。工具校验原文与摘要，语义结论仍是 AI 判断。体检不修改技能配置。'));
  return lines.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), command = args.shift();
    if (command !== 'audit') throw new Error('Usage: node scripts/skill-audit.mjs audit [--project <root>] [--language <zh|en>] [--write <file>] [--assessment <file>] [--write-markdown <file>]');
    let project = process.cwd(), language: 'zh' | 'en' | undefined, write: string | undefined, assessment: string | undefined, markdown: string | undefined;
    while (args.length) { const flag = args.shift(); const value = args.shift(); if (flag === '--project' && value) project = path.resolve(value); else if (flag === '--language' && (value === 'zh' || value === 'en')) language = value; else if (flag === '--write' && value) write = path.resolve(value); else if (flag === '--assessment' && value) assessment = path.resolve(value); else if (flag === '--write-markdown' && value) markdown = path.resolve(value); else throw new Error('Usage: node scripts/skill-audit.mjs audit [--project <root>] [--language <zh|en>] [--write <file>] [--assessment <file>] [--write-markdown <file>]'); }
    const report = auditSkills(project); if (language) report.assessment.language = language; if (assessment) { report.assessment = readAssessment(assessment, report, project); report.notes = report.assessment.status === 'reviewed' ? ['Inventory facts and semantic conclusions are separate.', 'Conclusions cover only cited skill pairs and stated scenarios; other combinations remain unassessed.'] : report.notes; } if (write) { fs.mkdirSync(path.dirname(write), { recursive: true }); fs.writeFileSync(write, JSON.stringify(report, null, 2) + '\n'); } if (markdown) { fs.mkdirSync(path.dirname(markdown), { recursive: true }); fs.writeFileSync(markdown, renderAuditMarkdown(report)); }
      console.log(JSON.stringify(report, null, 2));
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
