import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const action = readFileSync(
  fileURLToPath(
    new URL('../../.github/actions/setup-bun-env/action.yml', import.meta.url),
  ),
  'utf8',
);
const executableAction = action
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('#'))
  .join('\n');

test('keeps the shared Bun setup action free of runner package installs', () => {
  assert.doesNotMatch(executableAction, /\bapt-get\b/);
  assert.doesNotMatch(executableAction, /\binstall-deps\b/);
  assert.doesNotMatch(executableAction, /playwright install --with-deps/);
});

test('skips ffmpeg-static downloads without providing a working fake runtime', () => {
  assert.match(action, /echo "FFMPEG_BIN=\/bin\/false" >> "\$GITHUB_ENV"/);
});

test('downloads only the Playwright browser when its cache is cold', () => {
  assert.match(
    action,
    /if: \$\{\{ inputs\.cache-playwright == 'true' && steps\.playwright-cache\.outputs\.cache-hit != 'true' \}\}[\s\S]*?run: npx playwright install chromium/,
  );
});
