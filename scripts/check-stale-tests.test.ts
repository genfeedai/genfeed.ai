import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCheckStaleTests } from './check-stale-tests';

describe('check-stale-tests', () => {
  let originalCwd = '';
  let testDir = '';

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = mkdtempSync(path.join(tmpdir(), 'stale-test-check-'));
    process.chdir(testDir);
    writeFixture(
      'tsconfig.json',
      JSON.stringify(
        {
          compilerOptions: {
            baseUrl: '.',
            jsx: 'react-jsx',
          },
        },
        null,
        2,
      ),
    );
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(testDir, { force: true, recursive: true });
  });

  it('flags missing internal imports', () => {
    writeFixture(
      'apps/web/app/demo.spec.tsx',
      [
        "import { describe, expect, it } from 'vitest';",
        "import { missingThing } from './missing-thing';",
        '',
        "describe('demo', () => {",
        "  it('keeps scanning when imports drift', () => {",
        '    expect(missingThing).toBeDefined();',
        '  });',
        '});',
      ].join('\n'),
    );

    const result = runCheckStaleTests();

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.issueKinds).toContain('missing-import');
    expect(result.findings[0]?.missingImports[0]?.specifier).toBe(
      './missing-thing',
    );
  });

  it('resolves aliased imports from the nearest tsconfig', () => {
    writeFixture(
      'apps/web/app/tsconfig.test.json',
      JSON.stringify(
        {
          compilerOptions: {
            baseUrl: '.',
            jsx: 'react-jsx',
            paths: {
              '@app/*': ['./src/*'],
            },
          },
        },
        null,
        2,
      ),
    );
    writeFixture('apps/web/app/src/demo.ts', 'export const value = 42;');
    writeFixture(
      'apps/web/app/demo.spec.tsx',
      [
        "import { describe, expect, it } from 'vitest';",
        "import { value } from '@app/demo';",
        '',
        "describe('demo', () => {",
        "  it('resolves app aliases', () => {",
        '    expect(value).toBe(42);',
        '  });',
        '});',
      ].join('\n'),
    );

    const result = runCheckStaleTests();

    expect(result.findings).toHaveLength(0);
  });

  it('flags tests with no meaningful assertions', () => {
    writeFixture(
      'packages/demo/no-assertions.test.ts',
      [
        "import { describe, it } from 'vitest';",
        '',
        "describe('demo', () => {",
        "  it('does not actually verify anything', () => {",
        '    const value = 1 + 1;',
        '    void value;',
        '  });',
        '});',
      ].join('\n'),
    );

    const result = runCheckStaleTests();

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.issueKinds).toContain(
      'no-meaningful-assertions',
    );
    expect(result.findings[0]?.totalAssertions).toBe(0);
  });

  it('flags trivial assertion-only tests', () => {
    writeFixture(
      'packages/demo/trivial.test.ts',
      [
        "import { describe, expect, it } from 'vitest';",
        '',
        "describe('demo', () => {",
        "  it('only asserts tautologies', () => {",
        '    expect(true).toBe(true);',
        '  });',
        '});',
      ].join('\n'),
    );

    const result = runCheckStaleTests();

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.issueKinds).toContain('trivial-assertions-only');
    expect(result.findings[0]?.meaningfulAssertions).toBe(0);
    expect(result.findings[0]?.trivialAssertions).toBe(1);
  });

  it('counts assertion guards as meaningful', () => {
    writeFixture(
      'packages/demo/assertions.test.ts',
      [
        "import { describe, expect, it } from 'vitest';",
        '',
        "describe('demo', () => {",
        "  it('uses assertion guards', () => {",
        '    expect.hasAssertions();',
        '  });',
        '});',
      ].join('\n'),
    );

    const result = runCheckStaleTests();

    expect(result.findings).toHaveLength(0);
  });
});

function writeFixture(relativePath: string, content: string): void {
  const filePath = path.join(process.cwd(), relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}
