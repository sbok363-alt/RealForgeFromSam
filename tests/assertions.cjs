// Older suites use console.assert, which normally prints failures but exits zero.
// Make those assertions meaningful under the full regression harness.
const assert = require('node:assert/strict');
const { format } = require('node:util');
console.assert = (condition, ...message) => assert.ok(condition, format(...message));

// Node 24 can expose a sandboxed ENOMEM from os.userInfo(), which tsx uses
// only to choose a temporary cache directory. Keep the test runner usable in
// that environment without changing application code or production behavior.
try {
  const os = require('node:os');
  try { os.userInfo(); } catch (error) {
    if (error && error.code === 'ERR_SYSTEM_ERROR') {
      os.userInfo = () => ({ username: 'codex', uid: 0, gid: 0, shell: '', homedir: process.cwd() });
    }
  }
} catch { /* The normal host always provides os.userInfo. */ }
