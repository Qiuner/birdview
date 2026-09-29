import { spawnSync } from 'node:child_process';

// Keep the pre-PR checklist in one cross-platform command. It intentionally
// checks the tracked demo after regeneration so generated drift cannot hide in
// a passing source-only test run.
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const checks: Array<[string, string, string[]]> = [
  ['TypeScript', npm, ['run', 'typecheck']],
  ['Build artifacts', npm, ['run', 'check:build']],
  ['Unit tests', npm, ['test']],
  ['Browser tests', npm, ['run', 'test:browser']],
  ['Tracked demo regeneration', npm, ['run', 'build:demo']],
  ['Tracked demo diff', 'git', ['diff', '--exit-code', '--', 'examples/harness-activity.html']],
  ['Example validation', npm, ['run', 'validate:examples']],
  ['Documentation links and hashes', 'node', ['scripts/check-docs.mjs']],
];

for (const [label, command, args] of checks) {
  console.log(`\n[check:pr] ${label}`);
  const result = spawnSync(command, args, { stdio: 'inherit', windowsHide: true, shell: command === npm && process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(`[check:pr] failed: ${label}`);
    process.exit(result.status ?? 1);
  }
}
console.log('\n[check:pr] all checks passed');
