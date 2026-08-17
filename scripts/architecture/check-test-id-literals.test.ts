import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkTestIdLiterals,
  classifyIdShape,
  findTestIdLiteralViolations,
  HIGH_ENTROPY_THRESHOLD_BITS,
  shannonEntropyBitsPerChar,
} from './check-test-id-literals';

const testDirs: string[] = [];

afterEach(() => {
  for (const testDir of testDirs.splice(0)) {
    rmSync(testDir, { force: true, recursive: true });
  }
});

function fixture(files: Record<string, string>): string {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'test-id-literals-'));
  testDirs.push(rootDir);

  for (const [file, source] of Object.entries(files)) {
    const absolutePath = path.join(rootDir, file);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, source);
  }

  return rootDir;
}

// Built to look like scanner-triggering ids without being pasted from a real
// database: cuid-, cuid2-, ObjectId- and ULID-shaped tokens whose characters
// are spread evenly enough to clear the entropy floor. They are assembled from
// short chunks so this spec does not itself contain an id-shaped literal.
const HIGH_ENTROPY_CUID = ['cabcdefgh', 'ijklmnop', 'qrstuvwx'].join('');
const HIGH_ENTROPY_CUID2 = ['tz4a98xx', 'at96iws9', 'zmbrgj3a'].join('');
const HIGH_ENTROPY_OBJECT_ID = ['01234567', '89abcdef', '01234567'].join('');
const HIGH_ENTROPY_ULID = ['01ARZ3NDE', 'KTSV4RRFF', 'Q69G5FAV'].join('');

describe('shannonEntropyBitsPerChar', () => {
  it('scores label-built ids far below the floor and generated ids above it', () => {
    expect(shannonEntropyBitsPerChar('corg000000000000000000001')).toBeLessThan(
      HIGH_ENTROPY_THRESHOLD_BITS,
    );
    expect(shannonEntropyBitsPerChar('cmuser0000000000000000001')).toBeLessThan(
      HIGH_ENTROPY_THRESHOLD_BITS,
    );
    expect(shannonEntropyBitsPerChar(HIGH_ENTROPY_CUID)).toBeGreaterThanOrEqual(
      HIGH_ENTROPY_THRESHOLD_BITS,
    );
    expect(
      shannonEntropyBitsPerChar(HIGH_ENTROPY_OBJECT_ID),
    ).toBeGreaterThanOrEqual(HIGH_ENTROPY_THRESHOLD_BITS);
  });
});

describe('classifyIdShape', () => {
  it('recognises the entity id shapes the platform accepts', () => {
    expect(classifyIdShape(HIGH_ENTROPY_CUID)).toBe('cuid');
    expect(classifyIdShape(HIGH_ENTROPY_CUID2)).toBe('cuid2');
    expect(classifyIdShape(HIGH_ENTROPY_OBJECT_ID)).toBe('objectid');
    expect(classifyIdShape(HIGH_ENTROPY_ULID)).toBe('ulid');
  });

  it('ignores tokens that are not id-shaped', () => {
    expect(classifyIdShape('not-an-id')).toBeNull();
    expect(classifyIdShape('ThisIsAPascalCaseIdentifier')).toBeNull();
    expect(classifyIdShape('c'.repeat(30))).toBeNull();
  });
});

describe('findTestIdLiteralViolations', () => {
  it('accepts label-built and readable hand-written ids', () => {
    const source = [
      "import { testId } from '@genfeedai/helpers/testing/test-id.helper';",
      "const organizationId = testId('org');",
      "const brandId = 'cmbrand000000000000000001';",
      "const legacyId = '000000000000000000000001';",
    ].join('\n');

    expect(findTestIdLiteralViolations('example.spec.ts', source)).toEqual([]);
  });

  it('rejects high-entropy cuid, ObjectId and ULID literals with their line', () => {
    const source = [
      'describe("ids", () => {',
      `  const cuid = '${HIGH_ENTROPY_CUID}';`,
      `  const objectId = "${HIGH_ENTROPY_OBJECT_ID}";`,
      `  const ulid = \`${HIGH_ENTROPY_ULID}\`;`,
      '});',
    ].join('\n');

    const violations = findTestIdLiteralViolations('example.spec.ts', source);

    expect(
      violations.map(({ line, shape, token }) => ({ line, shape, token })),
    ).toEqual([
      { line: 2, shape: 'cuid', token: HIGH_ENTROPY_CUID },
      { line: 3, shape: 'objectid', token: HIGH_ENTROPY_OBJECT_ID },
      { line: 4, shape: 'ulid', token: HIGH_ENTROPY_ULID },
    ]);
    for (const violation of violations) {
      expect(violation.file).toBe('example.spec.ts');
      expect(violation.entropy).toBeGreaterThanOrEqual(
        HIGH_ENTROPY_THRESHOLD_BITS,
      );
    }
  });

  it('does not split tokens out of longer identifiers', () => {
    const source = `const value = 'prefix_${HIGH_ENTROPY_CUID}_suffix';\nconst other = 'x${HIGH_ENTROPY_OBJECT_ID}';`;

    expect(findTestIdLiteralViolations('example.spec.ts', source)).toEqual([]);
  });
});

describe('checkTestIdLiterals', () => {
  it('scans spec, test, __tests__, test/, e2e/ and playwright files only', () => {
    const rootDir = fixture({
      'apps/api/src/thing.service.ts': `const id = '${HIGH_ENTROPY_CUID}';`,
      'apps/api/src/thing.service.spec.ts': `const id = '${HIGH_ENTROPY_CUID}';`,
      'apps/api/test/mocks/thing.ts': `const id = '${HIGH_ENTROPY_OBJECT_ID}';`,
      'apps/app/e2e/flow.ts': `const id = '${HIGH_ENTROPY_CUID}';`,
      'node_modules/dep/index.test.ts': `const id = '${HIGH_ENTROPY_CUID}';`,
      'packages/thing/__tests__/thing.test.ts': `const id = '${HIGH_ENTROPY_ULID}';`,
      'packages/thing/dist/thing.test.js': `const id = '${HIGH_ENTROPY_CUID}';`,
      'playwright/e2e/tests/flow.spec.ts': `const id = '${HIGH_ENTROPY_CUID}';`,
    });

    expect(
      checkTestIdLiterals({ rootDir }).map((violation) => violation.file),
    ).toEqual([
      'apps/api/src/thing.service.spec.ts',
      'apps/api/test/mocks/thing.ts',
      'apps/app/e2e/flow.ts',
      'packages/thing/__tests__/thing.test.ts',
      'playwright/e2e/tests/flow.spec.ts',
    ]);
  });

  it('passes a clean tree', () => {
    const rootDir = fixture({
      'apps/api/src/thing.service.spec.ts':
        "import { testId } from '@genfeedai/helpers/testing/test-id.helper';\nconst id = testId('thing');",
    });

    expect(checkTestIdLiterals({ rootDir })).toEqual([]);
  });
});
