import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCheckAgentDecompositionSize } from './check-agent-decomposition-size';

const TREE = 'apps/server/api/src/services/agent-orchestrator';

describe('check-agent-decomposition-size', () => {
  let testDir = '';

  beforeEach(() => {
    testDir = mkdtempSync(path.join(tmpdir(), 'agent-decomposition-size-'));
  });

  afterEach(() => {
    rmSync(testDir, { force: true, recursive: true });
  });

  it('flags a ratcheted file that grew past its ceiling', () => {
    writeFixture(`${TREE}/big.service.ts`, linesOf(11));

    const result = runCheckAgentDecompositionSize({
      ceilings: { [`${TREE}/big.service.ts`]: 10 },
      rootDir: testDir,
    });

    expect(result.violations).toEqual([
      expect.objectContaining({
        ceiling: 10,
        file: `${TREE}/big.service.ts`,
        lines: 11,
      }),
    ]);
  });

  it('passes a ratcheted file at or below its ceiling', () => {
    writeFixture(`${TREE}/big.service.ts`, linesOf(10));

    const result = runCheckAgentDecompositionSize({
      ceilings: { [`${TREE}/big.service.ts`]: 10 },
      rootDir: testDir,
    });

    expect(result.violations).toEqual([]);
    expect(result.scannedFileCount).toBe(1);
  });

  it('flags a new untracked file over the general ceiling', () => {
    writeFixture(`${TREE}/new-handler.service.ts`, linesOf(6));

    const result = runCheckAgentDecompositionSize({
      ceilings: {},
      generalCeiling: 5,
      rootDir: testDir,
    });

    expect(result.violations).toEqual([
      expect.objectContaining({
        ceiling: 5,
        file: `${TREE}/new-handler.service.ts`,
        lines: 6,
      }),
    ]);
  });

  it('ignores spec and test files', () => {
    writeFixture(`${TREE}/huge.service.spec.ts`, linesOf(500));
    writeFixture(`${TREE}/huge.service.test.ts`, linesOf(500));

    const result = runCheckAgentDecompositionSize({
      ceilings: {},
      generalCeiling: 10,
      rootDir: testDir,
    });

    expect(result.violations).toEqual([]);
    expect(result.scannedFileCount).toBe(0);
  });

  function writeFixture(relativePath: string, contents: string): void {
    const absolutePath = path.join(testDir, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents);
  }

  // Produces content whose `wc -l` (newline count) equals `count`.
  function linesOf(count: number): string {
    return `${Array.from({ length: count }, (_, index) => `line ${index}`).join('\n')}\n`;
  }
});
