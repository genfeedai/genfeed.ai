import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SMOKE_TEXT_KINDS } from '../context-coverage/generation-types';
import { resolveRepoPath } from '../provenance';
import { fixtureRowSchema } from '../rows';
import { buildGenerationMessages } from '../suites/compare';
import { SMOKE_TEXT_FIXTURE } from './plan';

const rows = readFileSync(resolveRepoPath(SMOKE_TEXT_FIXTURE), 'utf8')
  .split('\n')
  .filter((line) => line.trim() !== '' && !line.startsWith('//'))
  .map((line) => fixtureRowSchema.parse(JSON.parse(line)));

describe('smoke text fixture', () => {
  it('covers every smoke text kind with at least two synthetic rows', () => {
    for (const kind of SMOKE_TEXT_KINDS) {
      expect(
        rows.filter((row) => row.contentKind === kind),
        `${kind} needs smoke rows`,
      ).toHaveLength(2);
    }
    expect(new Set(rows.map((row) => row.contentKind))).toEqual(
      new Set(SMOKE_TEXT_KINDS),
    );
  });

  it('holds only synthetic rows with unique ids', () => {
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    expect(rows.every((row) => row.source.visibility === 'synthetic')).toBe(
      true,
    );
  });

  it('carries the org and brand context only on the guided arm', () => {
    for (const row of rows) {
      const raw = JSON.stringify(
        buildGenerationMessages(row, {
          guidanceArm: 'raw',
          id: 'raw',
          isCompiled: false,
          registryKey: 'x/y',
        }),
      );
      const guided = JSON.stringify(
        buildGenerationMessages(row, {
          guidanceArm: 'brief',
          id: 'brief',
          isCompiled: false,
          registryKey: 'x/y',
        }),
      );
      expect(raw).not.toContain('Facts you may use');
      expect(guided).toContain('Facts you may use');
      expect(guided).toContain('Never use:');
    }
  });
});
