import { existsSync, readFileSync } from 'node:fs';
import { ContentType } from '@genfeedai/contracts/enums/content-type.enum';
import { GenerationType } from '@genfeedai/contracts/enums/generation-type.enum';
import { IngredientCategory } from '@genfeedai/contracts/enums/ingredient.enum';
import { describe, expect, it } from 'vitest';
import { resolveRepoPath } from '../provenance';
import {
  BRAND_CONTEXT_PATHS,
  GENERATION_TYPES,
  type GenerationTypeEntry,
  SMOKE_TEXT_KINDS,
} from './generation-types';

const ENUMS = {
  ContentType,
  GenerationType,
  IngredientCategory,
} as const;

/** Anything that composes the harness or the generation brief for a prompt. */
const BRAND_CONTEXT_CALLS =
  /\b(resolveBrief|resolveSnapshotBrief\w*|composeBrief|runImageGenerationBrief|runVideoGenerationBrief|HarnessGenerationService|ContentHarnessService)\b/;

const WITH_SOURCE: ReadonlyArray<GenerationTypeEntry['path']> = [
  'harness',
  'generation-brief',
  'brand-voice-summary',
  'none',
];
const GAP_PATHS: ReadonlyArray<GenerationTypeEntry['path']> = [
  'brand-voice-summary',
  'none',
];

function readSource(entry: GenerationTypeEntry): string {
  const path = resolveRepoPath(entry.source ?? '');
  expect(existsSync(path), `${entry.id}: ${entry.source} is missing`).toBe(
    true,
  );
  return readFileSync(path, 'utf8');
}

describe('generation type registry', () => {
  it('has unique ids and only known paths', () => {
    const ids = GENERATION_TYPES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of GENERATION_TYPES) {
      expect(BRAND_CONTEXT_PATHS).toContain(entry.path);
    }
  });

  it('claims every GenerationType, ContentType and IngredientCategory member exactly once', () => {
    for (const [enumName, members] of Object.entries(ENUMS)) {
      for (const member of Object.keys(members)) {
        const owners = GENERATION_TYPES.filter((entry) =>
          (
            entry.enumRefs[enumName as keyof typeof ENUMS] as
              | readonly string[]
              | undefined
          )?.includes(member),
        ).map((entry) => entry.id);
        expect(
          owners,
          `${enumName}.${member} must belong to exactly one registry row; add or move it in generation-types.ts`,
        ).toHaveLength(1);
      }
    }
  });

  it('names only enum members that exist', () => {
    for (const entry of GENERATION_TYPES) {
      for (const [enumName, refs] of Object.entries(entry.enumRefs)) {
        const members = ENUMS[enumName as keyof typeof ENUMS];
        for (const ref of refs) {
          expect(
            Object.keys(members),
            `${entry.id} names ${enumName}.${ref}, which does not exist`,
          ).toContain(ref);
        }
      }
    }
  });

  it('keeps each marker in its source file', () => {
    for (const entry of GENERATION_TYPES.filter((row) =>
      WITH_SOURCE.includes(row.path),
    )) {
      expect(entry.source, `${entry.id} needs a source`).toBeTruthy();
      expect(entry.marker, `${entry.id} needs a marker`).toBeTruthy();
      expect(
        readSource(entry),
        `${entry.id}: ${entry.source} no longer contains ${entry.marker}`,
      ).toContain(entry.marker ?? '');
    }
  });

  it('wires brand context into every harness and generation-brief path', () => {
    for (const entry of GENERATION_TYPES.filter(
      (row) => row.path === 'harness' || row.path === 'generation-brief',
    )) {
      expect(
        readSource(entry),
        `${entry.id}: ${entry.source} no longer composes brand context`,
      ).toMatch(BRAND_CONTEXT_CALLS);
    }
  });

  it('records each known gap, and forces a promotion when one is fixed', () => {
    for (const entry of GENERATION_TYPES.filter((row) =>
      GAP_PATHS.includes(row.path),
    )) {
      expect(entry.note, `${entry.id} must say what the gap is`).toMatch(
        /^GAP:/,
      );
      expect(
        readSource(entry),
        `${entry.id}: ${entry.source} now composes brand context; promote the row to \`harness\` or \`generation-brief\``,
      ).not.toMatch(BRAND_CONTEXT_CALLS);
    }
  });

  it('explains every exempt and unaudited row', () => {
    for (const entry of GENERATION_TYPES.filter(
      (row) => row.path === 'exempt' || row.path === 'unaudited',
    )) {
      expect(entry.note, `${entry.id} needs a reason`).toBeTruthy();
      expect(entry.smoke === null || entry.path === 'unaudited').toBe(true);
    }
  });

  it('lists the text kinds the smoke run must cover', () => {
    expect(SMOKE_TEXT_KINDS).toEqual(
      expect.arrayContaining(['social-post', 'article', 'newsletter']),
    );
  });
});
