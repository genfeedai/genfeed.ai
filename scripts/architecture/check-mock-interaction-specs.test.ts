import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  isMockInteractionHeavy,
  MIN_ASSERTION_COUNT,
  runCheckMockInteractionSpecs,
} from './check-mock-interaction-specs';

function specWith(assertions: string[]): string {
  return `it('works', () => {\n${assertions.map((line) => `  ${line}`).join('\n')}\n});\n`;
}

const MOCK_CALL = 'expect(save).toHaveBeenCalledWith({ id: 1 });';
const RESULT_CHECK = 'expect(result).toEqual({ id: 1 });';

describe('isMockInteractionHeavy', () => {
  it('flags a spec where more than half of the assertions are mock-interaction checks', () => {
    const result = isMockInteractionHeavy(
      specWith([MOCK_CALL, MOCK_CALL, MOCK_CALL, RESULT_CHECK, RESULT_CHECK]),
    );
    expect(result).toEqual({
      assertionCount: 5,
      isHeavy: true,
      mockInteractionCount: 3,
    });
  });

  it('accepts a spec that mostly asserts on results', () => {
    const result = isMockInteractionHeavy(
      specWith([
        MOCK_CALL,
        MOCK_CALL,
        RESULT_CHECK,
        RESULT_CHECK,
        RESULT_CHECK,
      ]),
    );
    expect(result.isHeavy).toBe(false);
  });

  it('does not flag an exact half', () => {
    const result = isMockInteractionHeavy(
      specWith([MOCK_CALL, MOCK_CALL, RESULT_CHECK, RESULT_CHECK]),
    );
    expect(result.isHeavy).toBe(false);
  });

  it('ignores specs below the minimum assertion count', () => {
    const lines = Array.from(
      { length: MIN_ASSERTION_COUNT - 1 },
      () => MOCK_CALL,
    );
    expect(isMockInteractionHeavy(specWith(lines)).isHeavy).toBe(false);
  });

  it('counts every toHaveBeenCalled variant', () => {
    const result = isMockInteractionHeavy(
      specWith([
        'expect(a).toHaveBeenCalled();',
        'expect(a).toHaveBeenCalledTimes(1);',
        'expect(a).toHaveBeenCalledWith(1);',
        'expect(a).toHaveBeenLastCalledWith(1);',
        'expect(a).toHaveBeenNthCalledWith(1, 1);',
      ]),
    );
    expect(result.mockInteractionCount).toBe(5);
  });

  it('does not count expect.objectContaining as an assertion', () => {
    const result = isMockInteractionHeavy(
      specWith([
        'expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));',
      ]),
    );
    expect(result.assertionCount).toBe(1);
  });
});

describe('runCheckMockInteractionSpecs', () => {
  let testDir = '';

  beforeEach(() => {
    testDir = mkdtempSync(path.join(tmpdir(), 'mock-interaction-specs-'));
  });

  afterEach(() => {
    rmSync(testDir, { force: true, recursive: true });
  });

  function write(file: string, content: string): void {
    const target = path.join(testDir, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }

  const heavySpec = specWith(Array.from({ length: 6 }, () => MOCK_CALL));
  const resultSpec = specWith(Array.from({ length: 6 }, () => RESULT_CHECK));

  it('rejects a new mock-heavy spec', () => {
    write('apps/server/api/src/foo.service.spec.ts', heavySpec);
    const { violations } = runCheckMockInteractionSpecs({
      baseline: [],
      rootDir: testDir,
    });
    expect(violations.map((v) => [v.file, v.kind])).toEqual([
      ['apps/server/api/src/foo.service.spec.ts', 'new-mock-heavy-spec'],
    ]);
  });

  it('accepts a baselined mock-heavy spec', () => {
    write('apps/server/api/src/foo.service.spec.ts', heavySpec);
    const { violations } = runCheckMockInteractionSpecs({
      baseline: ['apps/server/api/src/foo.service.spec.ts'],
      rootDir: testDir,
    });
    expect(violations).toEqual([]);
  });

  it('accepts a spec that asserts on results', () => {
    write('apps/server/api/src/foo.service.spec.ts', resultSpec);
    const { violations } = runCheckMockInteractionSpecs({
      baseline: [],
      rootDir: testDir,
    });
    expect(violations).toEqual([]);
  });

  it('fails a baseline entry whose spec no longer qualifies', () => {
    write('apps/server/api/src/foo.service.spec.ts', resultSpec);
    const { violations } = runCheckMockInteractionSpecs({
      baseline: ['apps/server/api/src/foo.service.spec.ts'],
      rootDir: testDir,
    });
    expect(violations.map((v) => v.kind)).toEqual(['stale-baseline']);
  });

  it('fails a baseline entry whose file is gone', () => {
    const { violations } = runCheckMockInteractionSpecs({
      baseline: ['apps/server/api/src/gone.service.spec.ts'],
      rootDir: testDir,
    });
    expect(violations.map((v) => [v.file, v.kind])).toEqual([
      ['apps/server/api/src/gone.service.spec.ts', 'stale-baseline'],
    ]);
  });

  it('ignores files that are not specs', () => {
    write('apps/server/api/src/foo.service.ts', heavySpec);
    const { scannedFileCount, violations } = runCheckMockInteractionSpecs({
      baseline: [],
      rootDir: testDir,
    });
    expect(scannedFileCount).toBe(0);
    expect(violations).toEqual([]);
  });
});
