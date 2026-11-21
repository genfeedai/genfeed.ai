import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyLiteral,
  classifyLiterals,
  describeFinding,
  extractLabels,
  extractLiterals,
  findStaleReferences,
  hasOptOut,
  isShippedSource,
  looseLocatorStrings,
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

test('findStaleReferences stays quiet once the spec asserts the new copy', () => {
  const removed = new Map([
    ['apps/web/src/Panel.tsx', [{ kind: 'phrase', text: 'Active runs' }]],
  ]);
  const specs = [spec('playwright/e2e/tests/a.spec.ts', "name: 'Running now'")];
  assert.deepEqual(findStaleReferences({ removed, specs }), []);
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

// Replays of master breaking after #10333 ("button labels are a verb or verb
// plus noun"), which edited some specs and left others. #10362 and #10376 fixed
// the leftovers. The diffs and spec lines below are the real ones, trimmed.

const messagesDiff = (file, removedLine, addedLine) =>
  [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    '@@ -1 +1 @@',
    `-${removedLine}`,
    `+${addedLine}`,
  ].join('\n');

function replay(diff, specs) {
  return findStaleReferences({
    removed: removedLiteralsByFile(diff),
    specs,
  }).map(({ literal, specFile }) => [specFile, literal]);
}

test('replay #10362: Skip for now became Skip, a loose locator now collides', () => {
  const diff = messagesDiff(
    'apps/web/messages/en/pages/onboarding.json',
    '      "skip": "Skip for now",',
    '      "skip": "Skip",',
  );
  const staleSpec = spec(
    'playwright/e2e/tests/onboarding/onboarding.spec.ts',
    "await page.getByRole('button', { name: 'Skip' }).click();",
  );
  const exactSpec = spec(
    'playwright/e2e/tests/onboarding/onboarding.spec.ts',
    "await page.getByRole('button', { exact: true, name: 'Skip' }).click();",
  );
  assert.deepEqual(replay(diff, [staleSpec]), [
    ['playwright/e2e/tests/onboarding/onboarding.spec.ts', 'Skip for now'],
  ]);
  assert.deepEqual(replay(diff, [exactSpec]), []);
});

test('replay #10362: Resize to {format} is matched on the text around the placeholder', () => {
  const diff = messagesDiff(
    'apps/web/messages/en/ui.json',
    '    "resizeTo": "Resize to {format}",',
    '    "resizeTo": "Resize {format}",',
  );
  const staleSpec = spec(
    'playwright/e2e/tests/studio/playground-video-actions-drafts.spec.ts',
    "const names = ['Resize to Square', 'Resize to Landscape'];",
  );
  const fixedSpec = spec(
    'playwright/e2e/tests/studio/playground-video-actions-drafts.spec.ts',
    "const names = ['Resize Square', 'Resize Landscape'];",
  );
  assert.deepEqual(replay(diff, [staleSpec]), [
    [
      'playwright/e2e/tests/studio/playground-video-actions-drafts.spec.ts',
      'Resize to',
    ],
  ]);
  assert.deepEqual(replay(diff, [fixedSpec]), []);
});

test('replay #10376: Unsave from swipe file became Unsave', () => {
  const diff = messagesDiff(
    'apps/web/messages/en/pages/adsResearch.json',
    '    "unsaveAction": "Unsave from swipe file",',
    '    "unsaveAction": "Unsave",',
  );
  const staleSpec = spec(
    'playwright/e2e/tests/discovery/prefilled-remix.spec.ts',
    "name: 'Unsave Durable Meta winner' } ... getByRole('button', {\n        name: 'Unsave',\n      })",
  );
  assert.deepEqual(replay(diff, [staleSpec]), [
    [
      'playwright/e2e/tests/discovery/prefilled-remix.spec.ts',
      'Unsave from swipe file',
    ],
  ]);
});

test('replay #10376: a removed hourglass glyph is still built into a spec string', () => {
  const diff = [
    'diff --git a/apps/web/src/features/workflows/utils/status-helpers.ts b/apps/web/src/features/workflows/utils/status-helpers.ts',
    '--- a/apps/web/src/features/workflows/utils/status-helpers.ts',
    '+++ b/apps/web/src/features/workflows/utils/status-helpers.ts',
    '@@ -10,2 +9,0 @@',
    '-    case WorkflowExecutionStatus.RUNNING:',
    "-      return '⏳'; // hourglass",
  ].join('\n');
  const staleSpec = spec(
    'playwright/e2e/tests/workflow/execution.spec.ts',
    'authenticatedPage.getByText(`⏳ ${runningExec.status}`, { exact: true })',
  );
  assert.deepEqual(replay(diff, [staleSpec]), [
    ['playwright/e2e/tests/workflow/execution.spec.ts', '⏳'],
  ]);
});

test('a spec the PR touched is still checked for the line it left behind', () => {
  const diff = messagesDiff(
    'apps/web/messages/en/ui.json',
    '    "resizeTo": "Resize to {format}",',
    '    "resizeTo": "Resize {format}",',
  );
  const half = spec(
    'playwright/e2e/tests/studio/a.spec.ts',
    "'Resize Square', 'Resize to Landscape'",
  );
  assert.deepEqual(replay(diff, [half]), [
    ['playwright/e2e/tests/studio/a.spec.ts', 'Resize to'],
  ]);
});

test('classifyLiterals splits placeholders and leaves interpolation alone', () => {
  assert.deepEqual(classifyLiterals('Resize to {format}'), [
    { kind: 'phrase', text: 'Resize to' },
  ]);
  assert.deepEqual(classifyLiterals('Save {title} to your swipe file'), [
    { kind: 'phrase', text: 'to your swipe file' },
  ]);
  assert.deepEqual(classifyLiterals('{count}'), []);
  assert.deepEqual(classifyLiterals('Hello ${name}, welcome back'), []);
});

test('classifyLiteral keeps a lone emoji and nothing else of that size', () => {
  assert.deepEqual(classifyLiteral('⏳'), { kind: 'glyph', text: '⏳' });
  assert.deepEqual(classifyLiteral('⏭️'), { kind: 'glyph', text: '⏭️' });
  assert.equal(classifyLiteral('→'), null);
  assert.equal(classifyLiteral('OK'), null);
});

test('extractLabels reads short visible text and skips object keys', () => {
  assert.deepEqual(extractLabels('      "agent": "Connect Agent",'), [
    'Connect Agent',
  ]);
  assert.deepEqual(extractLabels('  <Button>Skip</Button>'), ['Skip']);
  assert.deepEqual(extractLabels('  const x = 1;'), []);
});

test('a short label elsewhere in the file does not make a shortening', () => {
  const diff = [
    'diff --git a/apps/web/messages/en/pages/x.json b/apps/web/messages/en/pages/x.json',
    '--- a/apps/web/messages/en/pages/x.json',
    '+++ b/apps/web/messages/en/pages/x.json',
    '@@ -1 +1 @@',
    '-    "close": "Close this dialog",',
    '+    "close": "Dismiss it now",',
    '@@ -9 +9 @@',
    '+    "cancel": "Close",',
  ].join('\n');
  const looseSpec = spec(
    'playwright/e2e/tests/a.spec.ts',
    "page.getByRole('button', { name: 'Close' })",
  );
  assert.deepEqual(replay(diff, [looseSpec]), []);
});

test('looseLocatorStrings skips exact locators and very short text', () => {
  const content = [
    "page.getByRole('button', { name: 'Skip' })",
    "page.getByRole('button', { exact: true, name: 'Resize Square' })",
    "page.getByText('Open', { exact: true })",
    "page.getByText('Ready to publish')",
    "page.getByRole('link', { name: 'Go' })",
  ].join('\n');
  assert.deepEqual([...looseLocatorStrings(content)].sort(), [
    'ready to publish',
    'skip',
  ]);
});

test('describeFinding names the loose locator for a shortened label', () => {
  assert.match(
    describeFinding({
      literal: 'Skip for now',
      looseLocator: 'Skip',
      sourceFile: 'apps/web/messages/en/pages/onboarding.json',
      specFile: 'playwright/e2e/tests/onboarding/onboarding.spec.ts',
    }),
    /shortened.*exact: true/,
  );
});
