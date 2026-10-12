import type {
  BrandFactCheck,
  BrandFactCheckOutcome,
  BrandFactCheckRequest,
} from '@api/services/brand-validation/brand-fact-check.types';
import { BrandValidationService } from '@api/services/brand-validation/brand-validation.service';
import { hashBrandArtifactBytes } from '@api/services/brand-validation/brand-validation-artifact.util';
import {
  FACTUAL_COVERAGE_RULE_ID,
  resolveBrandFactCoverage,
} from '@api/services/brand-validation/brand-validation-fact.util';
import { buildBrandValidationChecks } from '@api/services/brand-validation/brand-validation-rules.util';
import {
  hashBrandedGenerationArtifactManifestV1,
  hashBrandedGenerationTextV1,
  hashBrandFactClaimsV1,
  hashBrandIdentitySnapshotV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import {
  type BrandFactClaimV1,
  brandArtifactValidationReportV1Schema,
} from '@genfeedai/contracts/api-types/contracts';
import type {
  BrandArtifactValidationInputV1,
  BrandIdentitySnapshotV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { describe, expect, it, vi } from 'vitest';

const service = new BrandValidationService();
const zeroHash = `sha256:${'0'.repeat(64)}`;
const DRAFT = 'Orders ship in two days. Free returns for 30 days.';

function snapshot(): BrandIdentitySnapshotV1 {
  const value: BrandIdentitySnapshotV1 = {
    approval: 'approved',
    brandId: 'brand-a',
    contentHash: zeroHash,
    diagnostics: [],
    generationRules: {
      assets: [],
      avoid: [],
      evidence: [
        { id: 'evidence-a', label: 'Synthetic source', sourceType: 'manual' },
      ],
      examples: [],
      facts: [
        {
          evidenceIds: ['evidence-a'],
          id: 'fact-shipping',
          kind: 'statement',
          match: 'literal',
          predicate: 'takes',
          required: false,
          subject: 'Shipping',
          value: 'two days',
        },
      ],
      mandatory: [],
      palette: [],
      schemaVersion: 1,
      typography: [],
    },
    identity: { name: 'Example Co' },
    organizationId: 'org-a',
    resolvedAt: '2026-10-01T00:00:00Z',
    revisionId: 'revision-a',
    revisionVersion: 1,
    schemaVersion: 1,
    voice: { audience: [], avoid: [], messagingPillars: [], values: [] },
  };
  value.contentHash = hashBrandIdentitySnapshotV1(value);
  return value;
}

function input(text = DRAFT): BrandArtifactValidationInputV1 {
  const textBytes = Buffer.from(text);
  return {
    artifact: {
      contentHash: hashBrandedGenerationArtifactManifestV1({
        mediaKind: 'text',
        parts: [],
        textHash: hashBrandArtifactBytes(textBytes),
      }),
      id: 'output-a',
      kind: 'post',
      mediaKind: 'text',
      parts: [],
      version: 'v1',
    },
    material: {
      artifactId: 'output-a',
      artifactKind: 'post',
      artifactVersion: 'v1',
      parts: [],
      references: [],
      textBytes,
    },
    snapshot: snapshot(),
  };
}

const shippingFact = {
  evidenceId: 'fact:fact-shipping',
  origin: 'brand_os' as const,
  quote: 'Shipping takes: two days',
  ruleId: 'fact-shipping',
};
function claim(
  index: number,
  verdict: BrandFactClaimV1['verdict'],
  origin: BrandFactClaimV1['origin'] = 'text',
): BrandFactClaimV1 {
  return {
    evidence:
      verdict === 'unverified'
        ? []
        : [{ ...shippingFact, evidenceId: `fact:fact-${index}` }],
    id: `claim-${index}`,
    origin,
    source: 'Orders ship in two days',
    text: 'Orders ship in two days',
    verdict,
  };
}
function checked(
  claims: BrandFactClaimV1[],
  overrides: Partial<
    Extract<BrandFactCheckOutcome, { status: 'checked' }>
  > = {},
): BrandFactCheckOutcome {
  return {
    claims,
    knowledgeVersions: [],
    models: ['judge-model'],
    status: 'checked',
    ...overrides,
  };
}
const factCheckOf = (outcome: BrandFactCheckOutcome) =>
  vi.fn<BrandFactCheck>(async () => outcome);
const factualOf = (report: { checks: Array<{ ruleId: string }> }) =>
  report.checks.find((check) => check.ruleId === FACTUAL_COVERAGE_RULE_ID);

describe('brand fact check: system:factual_coverage', () => {
  it('stays unknown, as before, when no fact check is wired', async () => {
    const report = await service.validateBrandArtifact(input());
    expect(factualOf(report)).toEqual({
      category: 'fact',
      evidenceIds: [],
      method: 'capability',
      reasonCode: 'factual_coverage_unverified',
      result: 'unknown',
      ruleId: 'system:factual_coverage',
      severity: 'hard',
    });
    expect(report.diagnostics.map((d) => d.code)).toEqual([
      'factual_coverage_unverified',
    ]);
  });

  it('passes only when every claim is supported, with a proof bound to the artifact and snapshot', async () => {
    const value = input();
    const supported = [claim(1, 'supported'), claim(2, 'supported')];
    const factCheck = factCheckOf(
      checked(supported, {
        knowledgeVersions: [
          { sourceId: 'source-b', version: 2, versionId: 'version-b' },
          { sourceId: 'source-a', version: 1, versionId: 'version-a' },
        ],
      }),
    );
    const report = await service.validateBrandArtifact(value, { factCheck });
    expect(brandArtifactValidationReportV1Schema.parse(report)).toBeTruthy();
    expect(factCheck).toHaveBeenCalledTimes(1);
    expect(factCheck.mock.calls[0][0]).toMatchObject({
      origin: 'text',
      text: DRAFT,
    });
    expect(factualOf(report)).toMatchObject({
      evaluatorId: 'brand-fact-check',
      evidenceIds: ['fact:fact-1', 'fact:fact-2'],
      method: 'semantic_evaluator',
      result: 'pass',
      severity: 'hard',
      proof: {
        algorithm: 'fact-check-v1',
        artifactHash: value.artifact.contentHash,
        claims: supported,
        claimsHash: hashBrandFactClaimsV1(supported),
        isTextComplete: true,
        kind: 'fact',
        mediaKind: 'text',
        models: ['judge-model'],
        snapshotHash: value.snapshot.contentHash,
        textHash: hashBrandedGenerationTextV1(DRAFT),
      },
    });
    const proof = factualOf(report) as {
      proof: { knowledgeVersions: unknown[] };
    };
    expect(proof.proof.knowledgeVersions).toEqual([
      { sourceId: 'source-a', version: 1, versionId: 'version-a' },
      { sourceId: 'source-b', version: 2, versionId: 'version-b' },
    ]);
    expect(report.diagnostics).toEqual([]);
  });

  it('passes a draft with no factual claims on an explicit no-claims proof', async () => {
    const report = await service.validateBrandArtifact(
      input('Say hello to the new season.'),
      { factCheck: factCheckOf(checked([])) },
    );
    expect(factualOf(report)).toMatchObject({
      evidenceIds: ['system:no_factual_claims'],
      proof: { claims: [], claimsHash: hashBrandFactClaimsV1([]) },
      result: 'pass',
    });
  });

  it('goes to review as unknown when any claim is unverified', async () => {
    const claims = [claim(1, 'supported'), claim(2, 'unverified')];
    const report = await service.validateBrandArtifact(input(), {
      factCheck: factCheckOf(checked(claims)),
    });
    expect(factualOf(report)).toMatchObject({
      reasonCode: 'factual_claim_unverified',
      result: 'unknown',
      severity: 'hard',
      proof: { claims },
    });
    expect(report.diagnostics.map((d) => d.code)).toEqual([
      'factual_coverage_unverified',
    ]);
  });

  it('hard-fails and blocks when any claim is contradicted, even beside unverified claims', async () => {
    const claims = [
      claim(1, 'supported'),
      claim(2, 'unverified'),
      claim(3, 'contradicted'),
    ];
    const report = await service.validateBrandArtifact(input(), {
      factCheck: factCheckOf(checked(claims)),
    });
    expect(factualOf(report)).toMatchObject({
      evidenceIds: ['fact:fact-3'],
      reasonCode: 'factual_claim_contradicted',
      result: 'fail',
      severity: 'hard',
    });
    expect(report.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ['factual_claim_contradicted', 'error'],
      ['brand_rule_failed', 'error'],
    ]);
  });

  it.each([
    'fact_check_budget_exhausted',
    'fact_check_claim_limit',
    'fact_check_evidence_unavailable',
    'fact_check_invalid_output',
    'fact_check_scope_mismatch',
    'fact_check_text_too_long',
    'fact_check_unavailable',
  ] as const)(
    'stays unknown, never pass, when the check is %s',
    async (reasonCode) => {
      const report = await service.validateBrandArtifact(input(), {
        factCheck: factCheckOf({ reasonCode, status: 'unavailable' }),
      });
      const factual = factualOf(report);
      expect(factual).toMatchObject({ reasonCode, result: 'unknown' });
      expect(factual).not.toHaveProperty('proof');
      expect(report.diagnostics.map((d) => d.code)).toEqual([
        'factual_coverage_unverified',
      ]);
    },
  );

  it('stays unknown when the check itself throws', async () => {
    const report = await service.validateBrandArtifact(input(), {
      factCheck: vi.fn(async () => {
        throw new Error('provider down');
      }),
    });
    expect(factualOf(report)).toMatchObject({
      reasonCode: 'fact_check_unavailable',
      result: 'unknown',
    });
  });

  it('replaces an answer that breaks its own contract with unknown instead of failing validation', async () => {
    const forged: BrandFactClaimV1 = { ...claim(1, 'supported'), evidence: [] };
    const report = await service.validateBrandArtifact(input(), {
      factCheck: factCheckOf(checked([forged])),
    });
    expect(factualOf(report)).toMatchObject({
      reasonCode: 'fact_check_invalid_output',
      result: 'unknown',
    });
  });

  it('never passes a text that is only part of the artifact', async () => {
    const value = input();
    value.artifact.parts.push({
      contentHash: hashBrandArtifactBytes(Buffer.from('overlay')),
      id: 'part-a',
      role: 'overlay',
      version: 'part-v1',
    });
    value.material.parts = [
      {
        bytes: Buffer.from('overlay'),
        partId: 'part-a',
        partVersion: 'part-v1',
      },
    ];
    value.artifact.contentHash = hashBrandedGenerationArtifactManifestV1({
      mediaKind: 'text',
      parts: value.artifact.parts,
      textHash: hashBrandArtifactBytes(
        value.material.textBytes ?? Buffer.alloc(0),
      ),
    });
    const report = await service.validateBrandArtifact(value, {
      factCheck: factCheckOf(checked([claim(1, 'supported')])),
    });
    expect(factualOf(report)).toMatchObject({
      proof: { isTextComplete: false },
      reasonCode: 'factual_coverage_text_incomplete',
      result: 'unknown',
    });
  });
});

describe('brand fact check: visuals', () => {
  const visual = {
    artifact: {
      contentHash: zeroHash,
      id: 'image-a',
      kind: 'ingredient' as const,
      mediaKind: 'image' as const,
      parts: [],
      version: 'v1',
    },
    snapshot: snapshot(),
  };
  const checksOf = () =>
    buildBrandValidationChecks(visual.snapshot, 'image', null, false);
  const run = (
    factCheck: BrandFactCheck,
    frameTexts: readonly string[] | null,
  ) =>
    resolveBrandFactCoverage({
      ...visual,
      checks: checksOf(),
      factCheck,
      frameTexts,
      isTextComplete: false,
      text: null,
    });

  it('does not call the check, or pay, when no text was read from the visual', async () => {
    const factCheck = factCheckOf(checked([]));
    for (const frames of [null, [], ['  \n ']]) {
      const checks = await run(factCheck, frames);
      expect(checks.at(-1)).toMatchObject({
        reasonCode: 'factual_coverage_unverified',
        result: 'unknown',
      });
    }
    expect(factCheck).not.toHaveBeenCalled();
  });

  it('checks the text read from the frames once, and a visual never passes', async () => {
    const factCheck = factCheckOf(checked([claim(1, 'supported', 'ocr')]));
    const checks = await run(factCheck, [
      'SALE 50% off',
      'SALE 50% off',
      'Ends Friday',
    ]);
    expect(factCheck.mock.calls[0][0]).toMatchObject({
      origin: 'ocr',
      text: 'SALE 50% off\nEnds Friday',
    } satisfies Partial<BrandFactCheckRequest>);
    expect(checks.at(-1)).toMatchObject({
      proof: { isTextComplete: false, mediaKind: 'image' },
      reasonCode: 'factual_coverage_media_unproven',
      result: 'unknown',
    });
  });

  it('still blocks a visual whose read text contradicts approved evidence', async () => {
    const checks = await run(
      factCheckOf(checked([claim(1, 'contradicted', 'ocr')])),
      ['Ships overnight'],
    );
    expect(checks.at(-1)).toMatchObject({
      reasonCode: 'factual_claim_contradicted',
      result: 'fail',
    });
  });
});
