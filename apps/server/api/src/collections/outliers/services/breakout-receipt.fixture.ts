import {
  hashBrandedGenerationArtifactManifestV1,
  hashBrandedGenerationTextV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import type {
  BrandArtifactValidationReportV1,
  BrandedGenerationReceiptV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';

/** A complete valid approved-brand text receipt, shared by the breakout recovery and composition specs. */
export const hash = `sha256:${'a'.repeat(64)}`;
export const time = '2026-10-01T00:00:00.000Z';
export const text = 'Acme follows up with a useful new observation.';
export const textVersion = hashBrandedGenerationTextV1(text);
export const artifactHash = hashBrandedGenerationArtifactManifestV1({
  mediaKind: 'text',
  textHash: textVersion,
  parts: [],
});
export function receipt(): BrandedGenerationReceiptV1 {
  return {
    schemaVersion: 1,
    id: 'receipt-a',
    organizationId: 'org-a',
    brandId: 'brand-a',
    actorId: 'user',
    requestKey: 'generation-a',
    candidateIndex: 0,
    requestHash: hash,
    revision: 0,
    state: 'checking',
    mode: 'approved_brand',
    surface: 'api',
    contentType: 'post',
    format: 'text',
    createdAt: time,
    updatedAt: time,
    snapshot: {
      schemaVersion: 1,
      organizationId: 'org-a',
      brandId: 'brand-a',
      revisionId: 'revision',
      revisionVersion: 1,
      approval: 'approved',
      resolvedAt: time,
      contentHash: hash,
      identity: { name: 'Acme' },
      voice: { audience: [], values: [], messagingPillars: [], avoid: [] },
      generationRules: {
        schemaVersion: 1,
        evidence: [
          { id: 'evidence', sourceType: 'manual', label: 'Owner attestation' },
        ],
        facts: [
          {
            id: 'fact',
            kind: 'statement',
            subject: 'Acme',
            predicate: 'name',
            value: 'Acme',
            evidenceIds: ['evidence'],
            required: true,
            match: 'literal',
          },
        ],
        palette: [],
        typography: [],
        mandatory: [],
        avoid: [],
        examples: [],
        assets: [],
      },
      diagnostics: [],
    },
    resolutionHash: hash,
    layers: [],
    learning: {
      schemaVersion: 1,
      brandFeedback: { status: 'not_applicable', sourceIds: [] },
      global: {
        status: 'not_applicable',
        scope: { format: 'text', objective: 'engagement' },
      },
      privateAccount: {
        mode: 'no_destination',
        configVersion: 'v1',
        synthetic: false,
        application: {
          status: 'unavailable',
          reasonCodes: ['no_destination'],
          privatePolicyApplied: false,
          sharedReleaseApplied: false,
          revalidatedAt: time,
        },
      },
    },
    prompts: {
      original: {
        contentHash: hash,
        retention: 'retained',
        snapshotId: 'original',
      },
      enhanced: null,
      compiled: {
        contentHash: hash,
        retention: 'retained',
        snapshotId: 'compiled',
      },
    },
    execution: {
      provider: 'provider',
      model: 'model',
      providerAttemptRef: 'attempt',
      dispatchClaimedAt: time,
      result: 'completed',
    },
    artifact: {
      kind: 'post',
      id: 'post-output-a',
      version: textVersion,
      contentHash: artifactHash,
      mediaKind: 'text',
      parts: [],
    },
    validation: null,
    compliance: 'unverified',
    diagnostics: [],
    costs: [
      { id: 'pending-cost', stage: 'generation', status: 'pending' },
      {
        id: 'unavailable-cost',
        stage: 'validation',
        status: 'unavailable',
        reasonCode: 'ledger_unavailable',
      },
    ],
    budget: {
      version: 'brand-enforcement-v1',
      maximumGenerationAttempts: 1,
      automaticPaidRetries: 0,
      generationAttemptsUsed: 1,
    },
    isDeleted: false,
  };
}
export function report(): BrandArtifactValidationReportV1 {
  return {
    schemaVersion: 1,
    id: 'report',
    rubricVersion: 1,
    snapshotHash: hash,
    artifactHash,
    artifactId: 'post-output-a',
    artifactVersion: textVersion,
    checkedAt: time,
    checks: [
      {
        ruleId: 'fact',
        category: 'fact',
        severity: 'hard',
        result: 'pass',
        method: 'exact_text',
        evidenceIds: ['actual-text'],
      },
    ],
    quality: null,
    diagnostics: [],
  };
}
