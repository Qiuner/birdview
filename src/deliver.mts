import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { validate, type ValidationResult } from './validate.mjs';
import { compileConstraintRules } from './compile-constraint-rules.mjs';
import { collectRuleHistory } from './constraint-rule-history.mjs';
import { renderArchitecture } from './render.mjs';
import { renderConstraintCatalog } from './render-constraints.mjs';
import type { Architecture } from './contracts/models.mjs';
import type { ConstraintCatalog, ReviewedConstraintCatalog, ReviewedSelection } from './constraint-types.mjs';

export interface DeliveryReceipt {
  ok: boolean;
  stage: 'inputs' | 'validate' | 'compile' | 'history' | 'render' | 'write' | 'complete';
  outputs: { html: string; sources?: string; constraints?: string } | null;
  written: string[];
  validation?: ValidationResult;
  map?: { mapId: string; revision: number };
  constraints?: { rules: number; snapshot: string; scope: string; historyGaps: string[] };
  visualReview: 'not-performed';
  implementationVerification: 'unverified';
  error?: string;
}

export const deliveryUsage = 'Usage: birdview deliver architecture.json project.html [activity.jsonl] (--catalog sources.json --rules reviewed-rules.json --repo root | --constraints reviewed.json | --architecture-only) [--repo root] [--bilingual] [--legacy]';

// Resolve existing parents too, so a linked output directory cannot alias input.
function canonical(file: string): string {
  if (!fs.existsSync(file) && path.dirname(file) === file) throw new Error(`Filesystem root does not exist: ${file}`);
  const resolved = fs.existsSync(file) ? fs.realpathSync(file) : path.join(canonical(path.dirname(file)), path.basename(file));
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/** Combine deterministic delivery steps; never infer rule semantics or visual acceptance. */
export function deliver(args: readonly string[]): DeliveryReceipt {
  const receipt: DeliveryReceipt = { ok: false, stage: 'inputs', outputs: null, written: [],
    visualReview: 'not-performed', implementationVerification: 'unverified' };
  try {
    const values = new Map<string, string>();
    const flags = new Set<string>();
    const positional: string[] = [];
    for (let index = 0; index < args.length; index++) {
      const arg = args[index]!;
      if (!arg.startsWith('--')) { positional.push(arg); continue; }
      if (values.has(arg) || flags.has(arg)) throw new Error(`Duplicate option: ${arg}`);
      if (['--architecture-only', '--bilingual', '--legacy'].includes(arg)) flags.add(arg);
      else if (['--catalog', '--rules', '--repo', '--constraints'].includes(arg)) {
        const value = args[++index];
        if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value.`);
        values.set(arg, path.resolve(value));
      } else throw new Error(`Unknown option: ${arg}. ${deliveryUsage}`);
    }
    const [input, output, activity] = positional;
    if (!input || !output || positional.length > 3) throw new Error(deliveryUsage);
    if (path.extname(output).toLowerCase() !== '.html') throw new Error('Output must be an .html file.');
    const catalogFile = values.get('--catalog'), rulesFile = values.get('--rules');
    const constraintsFile = values.get('--constraints'), repository = values.get('--repo');
    const compile = !!(catalogFile || rulesFile);
    if (Number(compile) + Number(!!constraintsFile) + Number(flags.has('--architecture-only')) !== 1
      || (compile && (!catalogFile || !rulesFile || !repository))) throw new Error(deliveryUsage);
    if (repository && !fs.statSync(repository).isDirectory()) throw new Error('--repo must be a directory.');
    const htmlOutput = path.resolve(output);
    receipt.outputs = { html: htmlOutput,
      ...(!flags.has('--architecture-only') ? { sources: htmlOutput.replace(/\.html$/i, '.sources.html') } : {}),
      ...(compile ? { constraints: htmlOutput.replace(/\.html$/i, '.constraints.json') } : {}) };
    const outputs = Object.values(receipt.outputs);
    const inputs = [input, activity, catalogFile, rulesFile, constraintsFile].filter((file): file is string => !!file).map(file => path.resolve(file));
    for (const target of outputs) {
      if (fs.existsSync(target) && !fs.lstatSync(target).isFile()) throw new Error(`Output must be a regular file: ${target}`);
      const targetStat = fs.existsSync(target) ? fs.statSync(target) : undefined;
      for (const source of inputs) {
        const sourceStat = fs.statSync(source);
        if (canonical(target) === canonical(source) || (targetStat && targetStat.ino !== 0 && targetStat.dev === sourceStat.dev && targetStat.ino === sourceStat.ino))
          throw new Error(`Output aliases input: ${target}`);
      }
    }
    const readJson = (file: string): unknown => {
      try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
      catch (error) { throw new Error(`Cannot read JSON ${file}: ${error instanceof Error ? error.message : String(error)}`); }
    };
    const map = readJson(input);
    const events: unknown[] = activity ? fs.readFileSync(activity, 'utf8').split(/\r?\n/).filter(line => line.trim()).map((line, index): unknown => {
      try { return JSON.parse(line); } catch { throw new Error(`Invalid JSON in activity record ${index + 1}.`); }
    }) : [];
    receipt.stage = 'validate';
    receipt.validation = validate(map, events, { requireRoles: !flags.has('--legacy'), requireBilingual: flags.has('--bilingual') });
    if (!receipt.validation.ok) return receipt;
    const architecture = map as Architecture;
    receipt.map = { mapId: architecture.mapId, revision: architecture.revision };
    let constraints: ReviewedConstraintCatalog | undefined;
    if (catalogFile && rulesFile && repository) {
      receipt.stage = 'compile';
      constraints = compileConstraintRules(readJson(catalogFile) as ConstraintCatalog, readJson(rulesFile) as ReviewedSelection);
      receipt.stage = 'history';
      constraints = collectRuleHistory(constraints, repository);
    } else if (constraintsFile) {
      receipt.stage = 'inputs';
      constraints = readJson(constraintsFile) as ReviewedConstraintCatalog;
      if (!constraints || !Array.isArray(constraints.rules) || !constraints.ruleReview) throw new Error('--constraints requires a reviewed catalog.');
    }
    // Prepare every artifact before any output write, including source-page validation.
    receipt.stage = 'render';
    const html = renderArchitecture(map, events, { ...(repository ? { repository } : {}),
      ...(constraints ? { constraintCatalog: constraints, constraintSourceHref: encodeURIComponent(path.basename(receipt.outputs.sources!)) } : {}) });
    const artifacts = new Map<string, string>();
    if (constraints) {
      artifacts.set(receipt.outputs.sources!, renderConstraintCatalog(constraints, undefined, { view: 'sources' }));
      if (receipt.outputs.constraints) artifacts.set(receipt.outputs.constraints, JSON.stringify(constraints, null, 2) + '\n');
      receipt.constraints = { rules: constraints.rules.length, snapshot: constraints.project.revision, scope: constraints.ruleReview.scope,
        historyGaps: constraints.rules.filter(rule => rule.history?.status !== 'tracked').map(rule => rule.id) };
    }
    artifacts.set(htmlOutput, html);
    receipt.stage = 'write';
    const pending = new Map<string, string>();
    try {
      for (const [target, content] of artifacts) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        const temporary = `${target}.${randomUUID()}.tmp`;
        pending.set(target, temporary);
        fs.writeFileSync(temporary, content, { flag: 'wx' });
      }
      // Publish the page last. Multiple renames are not a filesystem transaction;
      // report completed paths if an I/O failure interrupts publication.
      for (const [target, temporary] of pending) {
        fs.renameSync(temporary, target);
        receipt.written.push(target);
      }
    } finally {
      for (const temporary of pending.values()) {
        try { fs.rmSync(temporary, { force: true }); } catch { /* Preserve the primary I/O error. */ }
      }
    }
    receipt.ok = true;
    receipt.stage = 'complete';
  } catch (error) {
    receipt.error = error instanceof Error ? error.message : String(error);
  }
  return receipt;
}
