import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFixture } from '../../../../../scripts/content-eval/fixtures';
import { canonicalJson } from '../../../../../scripts/content-eval/provenance';
import {
  type FixtureRow,
  fixtureRowSchema,
} from '../../../../../scripts/content-eval/rows';
import {
  anonymiseText,
  buildAnonymisationContext,
  findResidualIdentifiers,
} from './anonymiser';
import { deriveBrandFixtureId, deriveRowId } from './fixture-ids';
import {
  AGREEMENT_FLOOR,
  EXCLUSION_REASONS,
  GOLDEN_CONTENT_KINDS,
  GOLDEN_SET_RUBRIC_VERSION,
  KIND_PROMPT_TEMPLATES,
} from './golden-set.constants';
import type {
  GoldenCandidate,
  GoldenContentKind,
  GoldenSetExcluded,
  GoldenSetScopeSnapshot,
  GoldenSetVisibility,
  GoldenSetWindow,
  LabelQualityReport,
} from './golden-set.types';
import {
  applyAgreementFloor,
  computeSourceAgreement,
  resolveRows,
} from './label-quality';
import { collectCandidates } from './row-mapping';

type BuildInput = {
  snapshots: GoldenSetScopeSnapshot[];
  key: string;
  visibility: GoldenSetVisibility;
  window: GoldenSetWindow | null;
};
function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function normalise(text: string): string {
  return text.replace(/\r\n/g, '\n').trim();
}
export function buildGoldenSet({
  snapshots,
  key,
  visibility,
  window,
}: BuildInput) {
  const excluded: GoldenSetExcluded = {
    conflict: 0,
    copyOfReview: 0,
    emptyText: 0,
    missingContent: 0,
    noBrand: 0,
    noLabel: 0,
    outOfScopeBrand: 0,
    residualIdentifier: 0,
    unsupportedKind: 0,
  };
  const prepared = snapshots.flatMap((snapshot) => {
    const brandIds = new Map(
      snapshot.brands.map((brand) => [
        brand.id,
        deriveBrandFixtureId(key, snapshot.scope.organizationId, brand.id),
      ]),
    );
    const context = buildAnonymisationContext(snapshot, brandIds);
    const collected = collectCandidates(snapshot);
    for (const reason of EXCLUSION_REASONS)
      excluded[reason] += collected.excluded[reason];
    return [...collected.candidates.values()].flatMap((candidate) => {
      const brandFixtureId = brandIds.get(candidate.brandId);
      if (!brandFixtureId) throw new Error('Candidate brand was not resolved');
      const text = normalise(anonymiseText(normalise(candidate.text), context));
      if (text.length === 0) {
        excluded.emptyText++;
        return [];
      }
      const prompt =
        normalise(
          anonymiseText(normalise(candidate.promptBase ?? ''), context),
        ) ||
        KIND_PROMPT_TEMPLATES[candidate.contentKind].replace(
          '{brandFixtureId}',
          brandFixtureId,
        );
      if (
        findResidualIdentifiers(text, context).length > 0 ||
        findResidualIdentifiers(prompt, context).length > 0
      ) {
        excluded.residualIdentifier++;
        return [];
      }
      const anonymised: GoldenCandidate = {
        ...candidate,
        text,
        promptBase: prompt,
      };
      return [
        {
          candidate: anonymised,
          organizationId: snapshot.scope.organizationId,
          brandFixtureId,
        },
      ];
    });
  });
  const sources = computeSourceAgreement(
    prepared.map((item) => item.candidate),
  );
  const filtered = applyAgreementFloor(
    prepared.map((item) => item.candidate),
    sources,
  );
  const identity = new Map(prepared.map((item) => [item.candidate, item]));
  const rows: FixtureRow[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < filtered.length; index++) {
    const candidate = filtered[index];
    const original = prepared[index]?.candidate;
    const item = original ? identity.get(original) : undefined;
    if (!candidate || !item) throw new Error('Candidate identity was lost');
    for (const resolved of resolveRows([candidate], excluded)) {
      const id = deriveRowId(
        key,
        item.organizationId,
        candidate.contentKind,
        candidate.contentKey,
      );
      if (ids.has(id)) throw new Error('Duplicate golden-set output id');
      ids.add(id);
      rows.push(
        fixtureRowSchema.parse({
          id,
          brandFixtureId: item.brandFixtureId,
          contentKind: candidate.contentKind,
          rubricVersion: GOLDEN_SET_RUBRIC_VERSION,
          input: {
            prompt: candidate.promptBase,
            output: candidate.text,
            brief: { bannedPhrases: [], isCtaRequired: false },
            ...(candidate.platform ? { platform: candidate.platform } : {}),
          },
          expected: resolved.expected,
          source: {
            reference: `golden-set-v1:${resolved.sources.join('+')}`,
            visibility,
          },
        }),
      );
    }
  }
  const files: Array<{
    contentKind: GoldenContentKind;
    fileName: string;
    body: string;
  }> = [];
  const kinds = GOLDEN_CONTENT_KINDS.map((contentKind) => {
    const kindRows = rows
      .filter((row) => row.contentKind === contentKind)
      .sort((a, b) => compare(a.id, b.id));
    if (kindRows.length > 0) {
      const fileName = `${contentKind}.${visibility}.jsonl`;
      const body = `// Golden set v1 (${visibility}) ${contentKind}: generated by apps/server/api/scripts/evals/export-golden-set.ts; do not edit by hand.\n${kindRows.map(canonicalJson).join('\n')}\n`;
      parseFixture(body, fileName);
      files.push({ contentKind, fileName, body });
    }
    return {
      contentKind,
      rows: kindRows.length,
      brands: new Set(kindRows.map((row) => row.brandFixtureId)).size,
      approve: kindRows.filter((row) => row.expected.decision === 'approve')
        .length,
      reject: kindRows.filter((row) => row.expected.decision === 'reject')
        .length,
      withScoreBand: kindRows.filter(
        (row) => row.expected.scoreBand !== undefined,
      ).length,
    };
  });
  const report: LabelQualityReport = {
    schemaVersion: 1,
    setVersion: 'golden-set-v1',
    visibility,
    window:
      window === null
        ? null
        : {
            from: window.from.toISOString().slice(0, 10),
            to: window.to.toISOString().slice(0, 10),
          },
    scopeCount: snapshots.length,
    agreementFloor: AGREEMENT_FLOOR,
    sources,
    kinds,
    excluded,
  };
  return { files, report };
}
export function writeGoldenSetFiles(
  outDir: string,
  result: ReturnType<typeof buildGoldenSet>,
): void {
  mkdirSync(outDir, { recursive: true });
  for (const file of result.files)
    writeFileSync(join(outDir, file.fileName), file.body);
  writeFileSync(
    join(outDir, `label-quality.${result.report.visibility}.json`),
    `${JSON.stringify(result.report, null, 2)}\n`,
  );
}
