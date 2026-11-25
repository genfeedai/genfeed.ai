import { compileSnapshotBriefResolution } from '@api/services/harness/branded-generation-compiler';
import { brandedGenerationResolutionV1Schema } from '@genfeedai/contracts/api-types/contracts/branded-generation.contract';
import type {
  BrandedGenerationInputV1,
  BrandIdentitySnapshotV1,
  BrandLearningApplicationV1,
} from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

const HASH = `sha256:${'a'.repeat(64)}`;

function snapshotWithGuidelines(length: number): BrandIdentitySnapshotV1 {
  return {
    approval: 'approved',
    brandId: 'brand',
    contentHash: HASH,
    diagnostics: [],
    generationRules: {
      assets: [],
      avoid: [],
      evidence: [],
      examples: [],
      facts: [],
      mandatory: [],
      palette: [],
      schemaVersion: 1,
      typography: [],
    },
    identity: { name: 'Acme' },
    organizationId: 'org',
    resolvedAt: '2026-10-01T00:00:00.000Z',
    revisionId: 'revision-a',
    revisionVersion: 1,
    schemaVersion: 1,
    voice: {
      audience: ['Founders'],
      avoid: [],
      guidelines: 'g'.repeat(length),
      messagingPillars: [],
      tone: 'Direct',
      values: [],
    },
  };
}

function textInput(): BrandedGenerationInputV1 {
  return {
    actorId: 'user',
    brandId: 'brand',
    candidateIndex: 0,
    contentType: 'post',
    format: 'text',
    generationParameters: {},
    knowledgeSourceIds: [],
    knowledgeSpaceIds: [],
    mode: 'approved_brand',
    model: 'fake',
    organizationId: 'org',
    originalPrompt: 'Write a post',
    provider: 'fake',
    requestKey: 'request',
    schemaVersion: 1,
    surface: 'api',
  };
}

function baselineLearning(): BrandLearningApplicationV1 {
  return {
    brandFeedback: { sourceIds: [], status: 'not_applicable' },
    global: {
      scope: { format: 'text', objective: 'engagement' },
      status: 'not_applicable',
    },
    privateAccount: {
      application: {
        privatePolicyApplied: false,
        reasonCodes: ['no_destination'],
        revalidatedAt: '2026-10-01T00:00:00.000Z',
        sharedReleaseApplied: false,
        status: 'unavailable',
      },
      configVersion: 'v1',
      mode: 'no_destination',
      synthetic: false,
    },
    schemaVersion: 1,
  };
}

function resolve(snapshot: BrandIdentitySnapshotV1) {
  return compileSnapshotBriefResolution(
    textInput(),
    snapshot,
    baselineLearning(),
    {},
    [],
    [],
    [],
  );
}

describe('a Brand Kit whose required text exceeds the budget', () => {
  it('blocks the generation with a diagnostic naming the longest field and the numbers', () => {
    const result = resolve(snapshotWithGuidelines(6200));
    expect(result).toMatchObject({
      reasonCode: 'context_budget_exceeded',
      status: 'blocked',
    });
    expect(result.diagnostics).toEqual([
      {
        code: 'context_budget_exceeded',
        message: expect.stringMatching(
          /^The Brand Kit text a generation must carry is [\d,]+ characters and the limit is 6,000, so it is [\d,]+ too long\. Shorten the longest fields: promptGuidelines \(6,202 characters\)/,
        ),
        severity: 'error',
      },
    ]);
    expect(brandedGenerationResolutionV1Schema.parse(result)).toEqual(result);
  });

  it('resolves the same kit once the guidelines fit', () => {
    expect(resolve(snapshotWithGuidelines(1000))).toMatchObject({
      status: 'resolved',
    });
  });
});
