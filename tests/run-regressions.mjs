import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const suites = readdirSync(new URL('./', import.meta.url))
  .filter(name => name.endsWith('.test.ts') && name !== 'emulator.test.ts')
  .sort();
const failures = [];
for (const suite of suites) {
  console.log(`\nRunning ${suite}`);
  const result = spawnSync(process.execPath, ['--require', './tests/assertions.cjs', '--import', 'tsx', `tests/${suite}`], {
    cwd: root, stdio: 'inherit', env: process.env,
  });
  if (result.error || result.status !== 0) {
    failures.push(suite);
    if (result.error) console.error(result.error.message);
  }
}
console.log(`\n${suites.length - failures.length}/${suites.length} regression suites passed.`);
if (failures.length) {
  console.error(`Failed: ${failures.join(', ')}`);
  process.exitCode = 1;
}
