import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = readFileSync(
  fileURLToPath(new URL('../sh/vercel-bun.sh', import.meta.url)),
  'utf8',
);

test('skips a second bun install when node_modules is already present', () => {
  assert.match(script, /"\$\{1:-\}" = "install"/);
  assert.match(script, /\[ -d node_modules \]/);
  assert.match(script, /\[ -f bun\.lock \]/);
  assert.match(script, /skipping bun install/);
});

test('uses the repository Bun policy for install and build', () => {
  assert.match(
    script,
    /BUN_VERSION=\$\(xargs < "\$SCRIPT_DIR\/\.\.\/\.\.\/\.bun-version"\)/,
  );
  assert.match(script, /exec bunx "bun@\$BUN_VERSION" "\$@"/);
  assert.doesNotMatch(script, /bun@(?:latest|\d+\.\d+\.\d+)/);
});
