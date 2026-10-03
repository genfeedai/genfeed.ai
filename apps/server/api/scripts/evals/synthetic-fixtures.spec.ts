import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFixture } from '../../../../../scripts/content-eval/fixtures';
import {
  buildAnonymisationContext,
  findResidualIdentifiers,
  prepareTerms,
} from './anonymiser';
import { deriveBrandFixtureId } from './fixture-ids';
import {
  GOLDEN_CONTENT_KINDS,
  SYNTHETIC_ANONYMISER_KEY,
} from './golden-set.constants';
import { buildGoldenSet } from './golden-set-export';
import { buildSyntheticSnapshot } from './synthetic-seed';

const directory = resolve(
  import.meta.dirname,
  '../../test/fixtures/content-evals/golden',
);
const snapshot = buildSyntheticSnapshot();
const brandFixtureIds = new Map(
  snapshot.brands.map((brand) => [
    brand.id,
    deriveBrandFixtureId(
      SYNTHETIC_ANONYMISER_KEY,
      snapshot.scope.organizationId,
      brand.id,
    ),
  ]),
);
const context = buildAnonymisationContext(snapshot, brandFixtureIds);
const rebuilt = buildGoldenSet({
  snapshots: [snapshot],
  key: SYNTHETIC_ANONYMISER_KEY,
  visibility: 'synthetic',
  window: null,
});

describe('committed synthetic golden fixtures', () => {
  it('matches every rebuilt JSONL file byte for byte', () => {
    expect(
      readdirSync(directory)
        .filter((name) => name.endsWith('.synthetic.jsonl'))
        .sort(),
    ).toEqual(rebuilt.files.map((file) => file.fileName).sort());
    for (const file of rebuilt.files)
      expect(readFileSync(resolve(directory, file.fileName))).toEqual(
        Buffer.from(file.body, 'utf8'),
      );
  });

  it('matches the rebuilt label-quality report', () => {
    const report: unknown = JSON.parse(
      readFileSync(resolve(directory, 'label-quality.synthetic.json'), 'utf8'),
    );
    expect(report).toEqual(rebuilt.report);
  });

  it.each(GOLDEN_CONTENT_KINDS)(
    'has the planned row count, synthetic visibility and derived brands for %s',
    (kind) => {
      const fileName = `${kind}.synthetic.jsonl`;
      const rows = parseFixture(
        readFileSync(resolve(directory, fileName), 'utf8'),
        fileName,
      );
      expect(rows).toHaveLength(kind === 'social-post' ? 45 : 36);
      expect(brandFixtureIds.size).toBe(3);
      expect(new Set(rows.map((row) => row.brandFixtureId))).toEqual(
        new Set(brandFixtureIds.values()),
      );
      for (const row of rows) {
        expect(row.source.visibility).toBe('synthetic');
        expect([...brandFixtureIds.values()]).toContain(row.brandFixtureId);
        if (typeof row.input.output !== 'string')
          throw new Error(
            'Every synthetic fixture row must have a string output',
          );
        expect(findResidualIdentifiers(row.input.output, context)).toEqual([]);
        expect(findResidualIdentifiers(row.input.prompt, context)).toEqual([]);
      }
    },
  );

  it('contains no raw synthetic labels, slugs, handles, people, ids or example domains in any file', () => {
    const rawTerms = [
      ...prepareTerms(context).map((entry) => entry.term),
      ...context.knownIds,
    ];
    for (const name of readdirSync(directory)) {
      const body = readFileSync(resolve(directory, name), 'utf8').toLowerCase();
      for (const term of rawTerms)
        expect(body).not.toContain(term.toLowerCase());
      expect(body).not.toMatch(/\b[a-z0-9_]+_studio\b/);
      expect(body).not.toContain('.example');
    }
  });
});
