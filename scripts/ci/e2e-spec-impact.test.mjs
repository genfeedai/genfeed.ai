import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyLiteral,
  extractLiterals,
  findStaleReferences,
  hasOptOut,
  isShippedSource,
  removedLiteralsByFile,
} from './e2e-spec-impact.mjs';

const buttonDiff = [
  'diff --git a/apps/web/src/Panel.tsx b/apps/web/src/Panel.tsx',
  '--- a/apps/web/src/Panel.tsx',
  '+++ b/apps/web/src/Panel.tsx',
  '@@ -10,2 +10,2 @@',
  '-        title="Active runs"',
  '+        title="Running now"',
  '-        <Button>Save changes</Button>',
  '+        <Button>Save changes</Button>',
].join('\n');

test('classifyLiteral keeps visible copy and kebab ids, drops everything else', () => {
  assert.deepEqual(classifyLiteral('Active runs'), {
    kind: 'phrase',
    text: 'Active runs',
  });
  assert.deepEqual(classifyLiteral('storyboard-run'), {
    kind: 'token',
    text: 'storyboard-run',
  });
  assert.equal(classifyLiteral('flex items-center gap-2'), null);
  assert.equal(classifyLiteral('flex-col'), null);
  assert.equal(classifyLiteral('undefined'), null);
  assert.equal(classifyLiteral('Videos'), null);
  assert.equal(classifyLiteral('): Promise<void>'), null);
  assert.equal(classifyLiteral('Hello ${name}, welcome back'), null);
});

test('extractLiterals reads quoted strings and JSX text, not imports or comments', () => {
  assert.deepEqual(extractLiterals('  title="Active runs"'), [
    { kind: 'phrase', text: 'Active runs' },
  ]);
  assert.deepEqual(extractLiterals('  <Button>Save changes</Button>'), [
    { kind: 'phrase', text: 'Save changes' },
  ]);
  assert.deepEqual(
    extractLiterals("import { thing } from './some long path'"),
    [],
  );
  assert.deepEqual(extractLiterals('// Active runs is gone'), []);
});

test('removedLiteralsByFile reports only strings the file no longer contains', () => {
  const removed = removedLiteralsByFile(buttonDiff);
  assert.deepEqual(
    [...removed.entries()],
    [['apps/web/src/Panel.tsx', [{ kind: 'phrase', text: 'Active runs' }]]],
  );
});

test('removedLiteralsByFile ignores tests, stories and non-source files', () => {
  const diff = [
    'diff --git a/apps/web/src/Panel.spec.tsx b/apps/web/src/Panel.spec.tsx',
    '--- a/apps/web/src/Panel.spec.tsx',
    '+++ b/apps/web/src/Panel.spec.tsx',
    '@@ -1 +1 @@',
    '-expect(screen.getByText("Active runs"))',
    '+expect(screen.getByText("Running now"))',
    'diff --git a/docs/guide.md b/docs/guide.md',
    '--- a/docs/guide.md',
    '+++ b/docs/guide.md',
    '@@ -1 +1 @@',
    '-Active runs',
    '+Running now',
  ].join('\n');
  assert.equal(removedLiteralsByFile(diff).size, 0);
});

test('isShippedSource limits the check to app and package sources', () => {
  assert.equal(isShippedSource('apps/web/messages/en/common.json'), true);
  assert.equal(isShippedSource('packages/ui/src/primitives/alert.tsx'), true);
  assert.equal(isShippedSource('packages/ui/src/alert.spec.tsx'), false);
  assert.equal(isShippedSource('packages/ui/package.json'), false);
  assert.equal(isShippedSource('apps/server/api/src/app.ts'), false);
  assert.equal(isShippedSource('playwright/e2e/tests/a.spec.ts'), false);
});

function spec(file, content) {
  return {
    content,
    file,
    normalized: content.replace(/\s+/g, ' ').trim().toLowerCase(),
  };
}

test('findStaleReferences flags an untouched spec that still asserts removed copy', () => {
  const removed = new Map([
    ['apps/web/src/Panel.tsx', [{ kind: 'phrase', text: 'Active runs' }]],
  ]);
  const specs = [
    spec(
      'playwright/e2e/tests/a.spec.ts',
      "getByRole('heading', { name: 'Active runs' })",
    ),
    spec('playwright/e2e/tests/b.spec.ts', "getByText('Something else')"),
  ];
  assert.deepEqual(
    findStaleReferences({
      changedFiles: ['apps/web/src/Panel.tsx'],
      removed,
      specs,
    }),
    [
      {
        literal: 'Active runs',
        sourceFile: 'apps/web/src/Panel.tsx',
        specFile: 'playwright/e2e/tests/a.spec.ts',
      },
    ],
  );
});

test('findStaleReferences stays quiet once the spec is part of the same change', () => {
  const removed = new Map([
    ['apps/web/src/Panel.tsx', [{ kind: 'phrase', text: 'Active runs' }]],
  ]);
  const specs = [spec('playwright/e2e/tests/a.spec.ts', "name: 'Active runs'")];
  assert.deepEqual(
    findStaleReferences({
      changedFiles: [
        'apps/web/src/Panel.tsx',
        'playwright/e2e/tests/a.spec.ts',
      ],
      removed,
      specs,
    }),
    [],
  );
});

test('findStaleReferences matches ids only when the spec quotes them exactly', () => {
  const removed = new Map([
    ['apps/web/src/Row.tsx', [{ kind: 'token', text: 'task-comments' }]],
  ]);
  const quoted = spec(
    'playwright/e2e/tests/a.spec.ts',
    "getByTestId('task-comments')",
  );
  const prose = spec(
    'playwright/e2e/tests/b.spec.ts',
    '// the task-comments panel',
  );
  const hits = findStaleReferences({
    changedFiles: ['apps/web/src/Row.tsx'],
    removed,
    specs: [quoted, prose],
  });
  assert.deepEqual(
    hits.map((hit) => hit.specFile),
    ['playwright/e2e/tests/a.spec.ts'],
  );
});

test('hasOptOut needs the trailer and a reason', () => {
  assert.equal(
    hasOptOut(
      'feat: x\n\nE2E-Spec-Impact: none - copy lives in a quarantined spec',
    ),
    true,
  );
  assert.equal(hasOptOut('feat: x\n\nE2E-Spec-Impact: none'), false);
  assert.equal(hasOptOut('feat: x'), false);
});
