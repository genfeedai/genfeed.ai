import { brandedGenerationReceiptV1Schema } from '@genfeedai/contracts/api-types/contracts/branded-generation.contract';
import {
  ContentLearningArm,
  ContentLearningMode,
} from '@genfeedai/contracts/enums';
import type {
  BrandArtifactValidationReportV1,
  BrandedGenerationReceiptV1,
  BrandGenerationRulesV1,
  BrandIdentitySnapshotV1,
} from '@genfeedai/contracts/interfaces';
import { projectGenerationReceiptForInspection } from '@pages/generation-receipts/generation-receipt-view';
import { describe, expect, it } from 'vitest';

const hash = `sha256:${'a'.repeat(64)}`;
const otherHash = `sha256:${'b'.repeat(64)}`;
const time = '2026-10-01T00:00:00.000Z';
function rules(): BrandGenerationRulesV1 {
  return {
    schemaVersion: 1,
    evidence: [
      { id: 'evidence', sourceType: 'manual', label: 'Owner attestation' },
    ],
    facts: [
      {
        id: 'fact',
        kind: 'statement',
        subject: 'product',
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
  };
}
function snapshot(): BrandIdentitySnapshotV1 {
  return {
    schemaVersion: 1,
    organizationId: 'org',
    brandId: 'brand',
    revisionId: 'revision',
    revisionVersion: 1,
    approval: 'approved',
    resolvedAt: time,
    contentHash: hash,
    identity: { name: 'Acme' },
    voice: { audience: [], values: [], messagingPillars: [], avoid: [] },
    generationRules: rules(),
    diagnostics: [],
  };
}
const learning = {
  schemaVersion: 1 as const,
  brandFeedback: { status: 'not_applicable' as const, sourceIds: [] },
  global: {
    status: 'not_applicable' as const,
    scope: { format: 'text' as const, objective: 'engagement' as const },
  },
  privateAccount: {
    mode: 'no_destination' as const,
    configVersion: 'v1',
    synthetic: false,
    application: {
      status: 'unavailable' as const,
      reasonCodes: ['no_destination'],
      privatePolicyApplied: false,
      sharedReleaseApplied: false,
      revalidatedAt: time,
    },
  },
};
function report(): BrandArtifactValidationReportV1 {
  return {
    schemaVersion: 1,
    id: 'report',
    rubricVersion: 1,
    snapshotHash: hash,
    artifactHash: hash,
    artifactId: 'post',
    artifactVersion: '1',
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
function receipt(): BrandedGenerationReceiptV1 {
  return {
    schemaVersion: 1,
    id: 'receipt',
    organizationId: 'org',
    brandId: 'brand',
    actorId: 'user',
    requestKey: ' request ',
    candidateIndex: 0,
    requestHash: hash,
    revision: 0,
    state: 'ready',
    mode: 'approved_brand',
    surface: 'studio',
    contentType: 'post',
    format: 'text',
    createdAt: time,
    updatedAt: time,
    snapshot: snapshot(),
    resolutionHash: hash,
    layers: [],
    learning,
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
      id: 'post',
      version: '1',
      contentHash: hash,
      mediaKind: 'text',
      parts: [],
    },
    validation: report(),
    compliance: 'passed',
    diagnostics: [],
    costs: [],
    budget: {
      version: 'brand-enforcement-v1',
      maximumGenerationAttempts: 1,
      automaticPaidRetries: 0,
      generationAttemptsUsed: 1,
    },
    isDeleted: false,
  };
}

function canonical(
  input: BrandedGenerationReceiptV1,
): BrandedGenerationReceiptV1 {
  return brandedGenerationReceiptV1Schema.parse(input);
}
function freezeDeep(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
}
describe('projectGenerationReceiptForInspection', () => {
  it('returns null for absent legacy history', () => {
    expect(projectGenerationReceiptForInspection(null)).toBeNull();
  });
  it('projects historical A with fresh nested references and omits top-level request/scope identity', () => {
    const input = canonical(receipt());
    const currentB = snapshot();
    currentB.revisionId = 'revision-b';
    currentB.identity.name = 'Current B';
    currentB.contentHash = otherHash;
    const before = structuredClone(input);
    freezeDeep(input);
    const view = projectGenerationReceiptForInspection(input);
    expect(view?.snapshot).toEqual(input.snapshot);
    expect(view?.snapshot?.revisionId).toBe('revision');
    expect(view?.snapshot?.identity.name).toBe('Acme');
    expect(view?.snapshot?.contentHash).not.toBe(currentB.contentHash);
    expect(view?.snapshot?.organizationId).toBe('org');
    expect(Object.keys(view ?? {}).sort()).toEqual(
      [
        'id',
        'revision',
        'execution',
        'resolutionHash',
        'state',
        'mode',
        'surface',
        'contentType',
        'format',
        'platform',
        'snapshot',
        'layers',
        'learning',
        'prompts',
        'artifact',
        'validation',
        'compliance',
        'diagnostics',
        'costs',
        'budget',
        'createdAt',
        'updatedAt',
      ].sort(),
    );
    expect(view).not.toBe(input);
    for (const key of [
      'snapshot',
      'layers',
      'learning',
      'prompts',
      'artifact',
      'validation',
      'diagnostics',
      'costs',
      'budget',
    ] as const)
      expect(view?.[key]).not.toBe(input[key]);
    expect(view?.snapshot?.generationRules.evidence).not.toBe(
      input.snapshot?.generationRules.evidence,
    );
    expect(view?.learning?.privateAccount.application).not.toBe(
      input.learning?.privateAccount.application,
    );
    if (view?.snapshot) view.snapshot.identity.name = 'Changed projection';
    view?.costs.push({ id: 'new', stage: 'generation', status: 'pending' });
    expect(input).toEqual(before);
  });
  it('preserves raw not_claimed without fabricating identity or validation', () => {
    const input = receipt();
    input.mode = 'raw';
    input.snapshot = null;
    input.validation = null;
    input.compliance = 'not_claimed';
    input.prompts.original = {
      contentHash: hash,
      retention: 'unavailable',
      reasonCode: 'legacy_missing',
    };
    input.prompts.compiled = {
      contentHash: hash,
      retention: 'unavailable',
      reasonCode: 'legacy_missing',
    };
    const view = projectGenerationReceiptForInspection(canonical(input));
    expect(view).toMatchObject({
      mode: 'raw',
      state: 'ready',
      snapshot: null,
      validation: null,
      compliance: 'not_claimed',
    });
    expect(view?.prompts.original.retention).toBe('unavailable');
  });
  it('preserves provisional unverified and unknown validation even with a high quality score', () => {
    const input = receipt();
    input.mode = 'provisional_brand';
    input.state = 'needs_review';
    input.compliance = 'unverified';
    if (input.snapshot) input.snapshot.approval = 'provisional';
    if (input.validation) {
      input.validation.checks[0].result = 'unknown';
      input.validation.checks[0].reasonCode = 'unsupported_evidence';
      input.validation.quality = {
        score: 1,
        confidence: 1,
        evaluatorId: 'evaluator',
        evaluatorVersion: 1,
        calibrationStatus: 'unverified',
      };
    }
    const view = projectGenerationReceiptForInspection(canonical(input));
    expect(view?.state).toBe('needs_review');
    expect(view?.compliance).toBe('unverified');
    expect(view?.snapshot?.approval).toBe('provisional');
    expect(view?.validation?.checks[0].result).toBe('unknown');
    expect(view?.validation?.quality?.score).toBe(1);
  });
  it('preserves sampled but suppressed nonbaseline learning without claiming application', () => {
    const input = receipt();
    if (input.learning)
      input.learning.privateAccount = {
        mode: ContentLearningMode.LIVE,
        configVersion: 'v1',
        synthetic: false,
        armId: ContentLearningArm.QUESTION_EXAMPLE,
        probabilities: { [ContentLearningArm.QUESTION_EXAMPLE]: 1 },
        selectedProbability: 1,
        application: {
          status: 'suppressed',
          reasonCodes: ['hard_constraints'],
          privatePolicyApplied: false,
          sharedReleaseApplied: false,
          revalidatedAt: time,
        },
      };
    const view = projectGenerationReceiptForInspection(canonical(input));
    expect(view?.learning?.privateAccount.armId).toBe(
      ContentLearningArm.QUESTION_EXAMPLE,
    );
    expect(view?.learning?.privateAccount.application).toEqual(
      input.learning?.privateAccount.application,
    );
    expect(view?.learning?.privateAccount.application?.status).toBe(
      'suppressed',
    );
    expect(view?.learning?.privateAccount.policyVersionId).toBeUndefined();
  });
  it('retains canonical mandatory_rule and asset_reference checks and deterministic methods', () => {
    const input = receipt();
    if (input.snapshot) {
      input.snapshot.generationRules.mandatory = [
        {
          id: 'mandatory',
          text: 'Acme',
          match: 'literal',
          required: true,
          evidenceIds: ['evidence'],
        },
      ];
      input.snapshot.generationRules.assets = [
        {
          id: 'style',
          assetId: 'asset',
          role: 'style',
          required: true,
          evidenceIds: ['evidence'],
          contentHash: hash,
        },
      ];
    }
    if (input.validation)
      input.validation.checks.push(
        {
          ruleId: 'mandatory',
          category: 'mandatory_rule',
          severity: 'hard',
          result: 'pass',
          method: 'exact_text',
          evidenceIds: ['actual-text'],
        },
        {
          ruleId: 'style',
          category: 'asset_reference',
          severity: 'hard',
          result: 'pass',
          method: 'asset_hash',
          evidenceIds: ['rendered-asset'],
        },
      );
    const view = projectGenerationReceiptForInspection(canonical(input));
    expect(view?.validation?.checks).toEqual(input.validation?.checks);
    expect(
      view?.validation?.checks.slice(1).map((check) => check.category),
    ).toEqual(['mandatory_rule', 'asset_reference']);
  });
  it('retains pending and unavailable costs without inferred amounts', () => {
    const input = receipt();
    input.costs = [
      { id: 'pending', stage: 'generation', status: 'pending' },
      {
        id: 'unavailable',
        stage: 'validation',
        status: 'unavailable',
        reasonCode: 'ledger_unavailable',
      },
    ];
    const view = projectGenerationReceiptForInspection(canonical(input));
    expect(view?.costs).toEqual(input.costs);
    expect(
      view?.costs.every(
        (cost) => cost.amount === undefined && cost.credits === undefined,
      ),
    ).toBe(true);
    expect(
      projectGenerationReceiptForInspection(canonical(receipt()))?.costs,
    ).toEqual([]);
  });
});

it('preserves public null optionals and pinned revision/execution/hash without private fields', () => {
  const internal = receipt();
  const {
    actorId: _actorId,
    requestKey: _requestKey,
    ...publicFields
  } = internal;
  const publicRead = {
    ...publicFields,
    platform: null,
    generationId: null,
    runId: null,
    parentRequestId: null,
    workflowExecutionId: null,
  };
  const projected = projectGenerationReceiptForInspection(publicRead);
  expect(projected).toMatchObject({
    revision: internal.revision,
    execution: internal.execution,
    resolutionHash: internal.resolutionHash,
    platform: null,
  });
  expect(projected).not.toHaveProperty('actorId');
  expect(projected).not.toHaveProperty('requestKey');
  expect(projected?.prompts).not.toBe(publicRead.prompts);
});

it('projects an exact public history revision with a detached execution and resolution hash', () => {
  const { actorId: _actorId, requestKey: _requestKey, ...fields } = receipt();
  const historical = {
    ...fields,
    id: 'receipt:7',
    receiptId: 'receipt',
    revision: 7,
  };
  const result = projectGenerationReceiptForInspection(historical);
  expect(result).toMatchObject({
    id: 'receipt:7',
    revision: 7,
    execution: fields.execution,
    resolutionHash: fields.resolutionHash,
  });
  expect(result?.execution).not.toBe(historical.execution);
});
