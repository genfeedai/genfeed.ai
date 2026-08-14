import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  collectorMatches,
  DEFAULT_VITEST_INCLUDES,
  extractVitestProjectGlobs,
  extractVitestTestGlobs,
  findUncollectedTestFiles,
  globToRegExp,
  matchGlob,
  TEST_COLLECTION_ALLOWLIST,
} from './check-test-collection.mjs';

const testDirectories = [];

afterEach(() => {
  for (const directory of testDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function fixture(files) {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'test-collection-'));
  testDirectories.push(rootDir);

  for (const [file, source] of Object.entries(files)) {
    const absolutePath = path.join(rootDir, file);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, source);
  }

  return rootDir;
}

describe('test collection guard', () => {
  it('matches nested globs and brace extensions', () => {
    assert.equal(matchGlob('src/foo.spec.ts', 'src/**/*.spec.ts'), true);
    assert.equal(matchGlob('src/crons/a.spec.ts', 'src/**/*.spec.ts'), true);
    assert.equal(
      matchGlob('src/card.test.tsx', 'src/**/*.test.{ts,tsx}'),
      true,
    );
    assert.equal(
      matchGlob('src/card.spec.ts', 'src/**/*.test.{ts,tsx}'),
      false,
    );
    assert.equal(globToRegExp('a/**/b').test('a/b'), true);
  });

  it('reads test include/exclude and ignores coverage include', () => {
    const globs = extractVitestTestGlobs(`
export default defineConfig({
  test: {
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts'],
    },
    exclude: ['src/crons/**/*.spec.ts'],
    include: ['src/**/*.spec.ts'],
  },
});
`);

    assert.deepEqual(globs.includes, ['src/**/*.spec.ts']);
    assert.deepEqual(globs.excludes, ['src/crons/**/*.spec.ts']);
  });

  it('falls back to Vitest defaults when test include is missing', () => {
    const globs = extractVitestTestGlobs(`
export default defineConfig({
  test: {
    environment: 'node',
  },
});
`);

    assert.ok(globs.includes.includes('**/*.test.ts'));
    assert.ok(globs.includes.includes('**/*.spec.ts'));
    for (const pattern of [
      '**/*.test.mts',
      '**/*.test.cts',
      '**/*.test.js',
      '**/*.test.jsx',
      '**/*.test.mjs',
      '**/*.test.cjs',
      '**/*.spec.mts',
      '**/*.spec.cts',
      '**/*.spec.jsx',
      '**/*.spec.mjs',
      '**/*.spec.cjs',
    ]) {
      assert.ok(
        globs.includes.includes(pattern),
        `fallback include must cover ${pattern}`,
      );
    }
    assert.equal(globs.includes.includes('**/*.e2e-spec.ts'), false);
  });

  it('reads workspace project globs from a variable list', () => {
    assert.deepEqual(
      extractVitestProjectGlobs(`
const testProjects = [
  'apps/server/*/vitest.config.ts',
  'apps/server/api/vitest.config.e2e.ts',
];

export default defineConfig({
  test: {
    projects: testProjects,
  },
});
`),
      [
        'apps/server/*/vitest.config.ts',
        'apps/server/api/vitest.config.e2e.ts',
      ],
    );
  });

  it('keeps e2e-spec out of the Vitest default include fallback', () => {
    assert.equal(DEFAULT_VITEST_INCLUDES.includes('**/*.e2e-spec.ts'), false);
    assert.ok(DEFAULT_VITEST_INCLUDES.includes('**/*.spec.mts'));
    assert.ok(DEFAULT_VITEST_INCLUDES.includes('**/*.test.cjs'));
  });

  it('flags a .spec.ts next to a *.test.ts-only include', () => {
    const rootDir = fixture({
      'packages/pages/package.json': JSON.stringify({
        scripts: { test: 'vitest run --config vitest.config.ts' },
      }),
      'packages/pages/vitest.config.ts': `
export default defineConfig({
  test: {
    include: ['**/*.test.ts', '**/*.test.tsx'],
  },
});
`,
      'packages/pages/research/url.test.ts': "import { it } from 'vitest';",
      'packages/pages/research/url.spec.ts': "import { it } from 'vitest';",
    });

    assert.deepEqual(findUncollectedTestFiles(rootDir), [
      { collectors: [], file: 'packages/pages/research/url.spec.ts' },
    ]);
  });

  it('treats a second config in the same workspace as a collector', () => {
    const rootDir = fixture({
      'apps/server/workers/package.json': JSON.stringify({
        scripts: {
          test: 'vitest run --config vitest.config.ts',
          'test:cron': 'vitest run --config vitest.cron.config.ts',
        },
      }),
      'apps/server/workers/vitest.config.ts': `
export default defineConfig({
  test: {
    exclude: ['src/crons/**/*.spec.ts'],
    include: ['src/**/*.spec.ts'],
  },
});
`,
      'apps/server/workers/vitest.cron.config.ts': `
export default defineConfig({
  test: {
    include: ['src/crons/**/*.spec.ts'],
  },
});
`,
      'apps/server/workers/src/jobs/queue.service.spec.ts':
        "import { it } from 'vitest';",
      'apps/server/workers/src/crons/posts/cron.posts.service.spec.ts':
        "import { it } from 'vitest';",
    });

    assert.deepEqual(findUncollectedTestFiles(rootDir), []);
  });

  it('leaves tests uncollected when their Vitest config is unused', () => {
    const rootDir = fixture({
      'packages/pages/package.json': JSON.stringify({
        scripts: { test: 'vitest run --config vitest.config.ts' },
      }),
      'packages/pages/vitest.config.ts': `
export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
  },
});
`,
      'packages/pages/vitest.orphan.config.ts': `
export default defineConfig({
  test: {
    include: ['legacy/**/*.spec.ts'],
  },
});
`,
      'packages/pages/research/url.test.ts': "import { it } from 'vitest';",
      'packages/pages/legacy/old.spec.ts': "import { it } from 'vitest';",
    });

    assert.deepEqual(findUncollectedTestFiles(rootDir), [
      { collectors: [], file: 'packages/pages/legacy/old.spec.ts' },
    ]);
  });

  it('does not treat coverage exclude as a test exclude', () => {
    const rootDir = fixture({
      'apps/server/files/package.json': JSON.stringify({
        scripts: { test: 'vitest run --config vitest.config.ts' },
      }),
      'apps/server/files/vitest.config.ts': `
export default defineConfig({
  test: {
    coverage: {
      exclude: ['src/**/*.spec.ts'],
      include: ['src/**/*.ts'],
    },
    include: ['src/**/*.spec.ts'],
  },
});
`,
      'apps/server/files/src/controllers/files.controller.spec.ts':
        "import { it } from 'vitest';",
    });

    assert.deepEqual(findUncollectedTestFiles(rootDir), []);
  });

  it('matches static Playwright and node:test collectors', () => {
    assert.equal(
      collectorMatches(
        {
          id: 'playwright-e2e',
          root: 'playwright',
          includes: ['e2e/tests/**/*.spec.ts'],
        },
        'playwright/e2e/tests/core/automation-loop.spec.ts',
      ),
      true,
    );
    assert.equal(
      collectorMatches(
        {
          id: 'node-test-scripts',
          root: '.',
          includes: ['scripts/**/*.test.mjs'],
        },
        'scripts/architecture/check-test-collection.test.mjs',
      ),
      true,
    );
  });

  it('requires allowlist rows to carry a tracking issue', () => {
    for (const entry of TEST_COLLECTION_ALLOWLIST) {
      assert.equal(typeof entry.file, 'string');
      assert.ok(entry.file.length > 0);
      assert.equal(typeof entry.reason, 'string');
      assert.ok(entry.reason.length > 0);
      assert.equal(typeof entry.trackingIssue, 'number');
      assert.ok(entry.trackingIssue > 0);
    }
  });

  it('passes the live repository after known orphans are collected', () => {
    const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
    const orphans = findUncollectedTestFiles(repositoryRoot);
    assert.deepEqual(
      orphans.map((entry) => entry.file),
      [],
    );
  });
});
