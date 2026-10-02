import {
  ContentLearningArm,
  ContentLearningMode,
} from '@genfeedai/contracts/enums';
import type { BrandedGenerationReceiptV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { brandedGenerationReceiptAttributes } from '@serializers/attributes/content/branded-generation-receipt.attributes';
import { BrandedGenerationReceiptSerializer } from '@serializers/server/content/branded-generation-receipt.serializer';
import { describe, expect, it } from 'vitest';

const hash = `sha256:${'a'.repeat(64)}`;
const optionalLineageKeys = [
  'platform',
  'parentRequestId',
  'runId',
  'workflowExecutionId',
  'generationId',
] as const;
const time = '2026-10-01T00:00:00.000Z';
function receipt(): BrandedGenerationReceiptV1 {
  return {
    schemaVersion: 1,
    id: 'receipt',
    organizationId: 'org',
    brandId: 'brand',
    actorId: 'PRIVATE_ACTOR',
    requestKey: 'PRIVATE_REQUEST',
    candidateIndex: 0,
    requestHash: hash,
    revision: 0,
    state: 'created',
    mode: 'raw',
    surface: 'api',
    contentType: 'post',
    format: 'text',
    createdAt: time,
    updatedAt: time,
    snapshot: null,
    resolutionHash: null,
    layers: [],
    learning: null,
    prompts: {
      original: { contentHash: hash, retention: 'pending' },
      enhanced: null,
      compiled: null,
    },
    execution: null,
    artifact: null,
    validation: null,
    compliance: 'not_claimed',
    diagnostics: [],
    costs: [{ id: 'cost', stage: 'generation', status: 'pending' }],
    budget: {
      version: 'brand-enforcement-v1',
      maximumGenerationAttempts: 1,
      automaticPaidRetries: 0,
      generationAttemptsUsed: 0,
    },
    isDeleted: false,
  };
}
function resolved(): BrandedGenerationReceiptV1 {
  const v = receipt();
  v.mode = 'approved_brand';
  v.state = 'resolved';
  v.compliance = 'unverified';
  v.resolutionHash = hash;
  v.prompts.compiled = { contentHash: hash, retention: 'pending' };
  v.snapshot = {
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
    generationRules: {
      schemaVersion: 1,
      evidence: [],
      facts: [],
      palette: [],
      typography: [],
      mandatory: [],
      avoid: [],
      examples: [],
      assets: [],
    },
    diagnostics: [],
  };
  v.learning = {
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
  };
  return v;
}
describe('validated public branded receipt serializer', () => {
  it('has exact resource/id and public attributes without actor/request identity', () => {
    const v = receipt();
    const output = BrandedGenerationReceiptSerializer.serialize(v);
    expect(output.data.id).toBe(v.id);
    expect(output.data.type).toBe('branded-generation-receipt');
    expect(Object.keys(output.data.attributes).sort()).toEqual(
      brandedGenerationReceiptAttributes
        .filter(
          (key) => !optionalLineageKeys.some((optional) => optional === key),
        )
        .sort(),
    );
    for (const key of optionalLineageKeys)
      expect(output.data.attributes).not.toHaveProperty(key);
    expect(JSON.stringify(output)).not.toContain('PRIVATE_');
    expect(output.data.attributes).not.toHaveProperty('id');
    expect(output.data.attributes).not.toHaveProperty('actorId');
    expect(output.data.attributes).not.toHaveProperty('requestKey');
  });
  it('preserves supplied optional lineage and omission in a mixed collection without mutating input', () => {
    const absent = receipt();
    const present: BrandedGenerationReceiptV1 = {
      ...receipt(),
      id: 'present',
      platform: 'instagram',
      parentRequestId: 'parent',
      runId: 'run',
      workflowExecutionId: 'workflow',
      generationId: 'generation',
    };
    const before = structuredClone(present);
    const output = BrandedGenerationReceiptSerializer.serialize(present);
    expect(output.data.id).toBe('present');
    expect(output.data.type).toBe('branded-generation-receipt');
    expect(Object.keys(output.data.attributes).sort()).toEqual(
      [...brandedGenerationReceiptAttributes].sort(),
    );
    for (const key of optionalLineageKeys)
      expect(output.data.attributes[key]).toBe(present[key]);
    for (const key of ['id', 'actorId', 'requestKey'])
      expect(output.data.attributes).not.toHaveProperty(key);
    expect(JSON.stringify(output)).not.toContain('PRIVATE_');
    expect(present).toEqual(before);
    const input = [absent, present];
    const collectionBefore = structuredClone(input);
    const collection = BrandedGenerationReceiptSerializer.serialize(input);
    expect(collection.data).toHaveLength(2);
    expect(collection.data.map((item: { id: string }) => item.id)).toEqual([
      absent.id,
      present.id,
    ]);
    for (const key of optionalLineageKeys) {
      expect(collection.data[0].attributes).not.toHaveProperty(key);
      expect(collection.data[1].attributes[key]).toBe(present[key]);
    }
    expect(Object.keys(collection.data[0].attributes).sort()).toEqual(
      brandedGenerationReceiptAttributes
        .filter(
          (key) => !optionalLineageKeys.some((optional) => optional === key),
        )
        .sort(),
    );
    expect(Object.keys(collection.data[1].attributes).sort()).toEqual(
      [...brandedGenerationReceiptAttributes].sort(),
    );
    for (const resource of collection.data) {
      expect(resource.type).toBe('branded-generation-receipt');
      for (const key of ['id', 'actorId', 'requestKey'])
        expect(resource.attributes).not.toHaveProperty(key);
    }
    expect(JSON.stringify(collection)).not.toContain('PRIVATE_');
    expect(input).toEqual(collectionBefore);
  });
  it('serializes collection and null while retaining built serializer opts', () => {
    const opts = Reflect.get(BrandedGenerationReceiptSerializer, 'opts');
    const output = BrandedGenerationReceiptSerializer.serialize([
      receipt(),
      { ...receipt(), id: 'second' },
    ]);
    expect(output.data).toHaveLength(2);
    expect(output.data.map((item: { id: string }) => item.id)).toEqual([
      'receipt',
      'second',
    ]);
    expect(BrandedGenerationReceiptSerializer.serialize(null)).toEqual({
      data: null,
    });
    expect(Reflect.get(BrandedGenerationReceiptSerializer, 'opts')).toBe(opts);
  });
  it('preserves null slots and pending/unavailable cost omission without fake amounts', () => {
    const v = receipt();
    v.costs.push({
      id: 'unavailable',
      stage: 'validation',
      status: 'unavailable',
      reasonCode: 'ledger_unavailable',
    });
    const before = structuredClone(v);
    const attrs =
      BrandedGenerationReceiptSerializer.serialize(v).data.attributes;
    for (const key of [
      'snapshot',
      'resolutionHash',
      'learning',
      'execution',
      'artifact',
      'validation',
    ])
      expect(attrs[key]).toBeNull();
    expect(attrs.prompts.enhanced).toBeNull();
    expect(attrs.prompts.compiled).toBeNull();
    expect(attrs.costs).toEqual(v.costs);
    expect(attrs.costs[0]).not.toHaveProperty('credits');
    expect(attrs.costs[1]).not.toHaveProperty('amount');
    expect(v).toEqual(before);
  });
  it('keeps unavailable branded identity a blockednull projection', () => {
    const v = receipt();
    v.mode = 'approved_brand';
    v.state = 'blocked';
    v.compliance = 'unverified';
    v.diagnostics = [
      {
        code: 'no_approved_revision',
        severity: 'error',
        message: 'No approved guide',
      },
    ];
    const attrs =
      BrandedGenerationReceiptSerializer.serialize(v).data.attributes;
    expect(attrs.state).toBe('blocked');
    expect(attrs.snapshot).toBeNull();
    expect(attrs.validation).toBeNull();
  });
  it.each([
    { agentConfig: { prompt: 'SECRET' } },
    { ciphertext: 'SECRET' },
    { relation: { id: 'SECRET' } },
  ])('rejects unexpected source payload %j', (patch) => {
    expect(() =>
      BrandedGenerationReceiptSerializer.serialize({ ...receipt(), ...patch }),
    ).toThrow();
  });
  it.each([
    {
      prompts: {
        ...receipt().prompts,
        original: { contentHash: hash, retention: 'pending', body: 'SECRET' },
      },
    },
    {
      prompts: {
        ...receipt().prompts,
        original: {
          contentHash: hash,
          retention: 'pending',
          ciphertext: 'SECRET',
        },
      },
    },
    {
      execution: {
        provider: 'p',
        model: 'm',
        providerAttemptRef: 'attempt',
        dispatchClaimedAt: time,
        result: 'pending',
        token: 'SECRET',
      },
    },
  ])('rejects forbidden nested payload %j', (patch) => {
    expect(() =>
      BrandedGenerationReceiptSerializer.serialize({ ...receipt(), ...patch }),
    ).toThrow();
  });
  it('validates every collection entry without silently filtering malformed resources', () => {
    expect(() =>
      BrandedGenerationReceiptSerializer.serialize([
        receipt(),
        { ...receipt(), unknown: true },
      ]),
    ).toThrow();
    expect(() =>
      BrandedGenerationReceiptSerializer.serialize([receipt(), null]),
    ).toThrow();
  });
  it('preserves deliberately supplied tombstones rather than fabricating active rows', () => {
    const attrs = BrandedGenerationReceiptSerializer.serialize({
      ...receipt(),
      isDeleted: true,
    }).data.attributes;
    expect(attrs.isDeleted).toBe(true);
  });
  it('retains unavailable private learning independent of applied stable global receipt', () => {
    const v = resolved();
    if (!v.learning) throw new Error('Missing learning fixture');
    v.learning.global = {
      status: 'applied',
      releaseId: 'release',
      releaseRevision: 1,
      policyId: 'policy',
      descriptorHash: 'a'.repeat(64),
      contributionHash: hash,
      brandPreferenceRevision: 0,
      stage: 'stable',
      scope: { platform: 'instagram', format: 'text', objective: 'engagement' },
      revalidatedAt: time,
    };
    const attrs =
      BrandedGenerationReceiptSerializer.serialize(v).data.attributes;
    expect(attrs.learning.global.status).toBe('applied');
    expect(attrs.learning.global.descriptorHash).toBe('a'.repeat(64));
    expect(attrs.learning.privateAccount.application.status).toBe(
      'unavailable',
    );
    expect(attrs.learning.privateAccount.application.privatePolicyApplied).toBe(
      false,
    );
  });
  it('retains complete applied decision provenance without promoting selected IDs alone', () => {
    const v = resolved();
    if (!v.learning) throw new Error('Missing learning fixture');
    v.learning.privateAccount = {
      mode: ContentLearningMode.LIVE,
      configVersion: 'v1',
      synthetic: false,
      decisionId: 'decision',
      credentialId: 'credential',
      baselineId: 'baseline',
      opportunityId: 'opportunity',
      experimentId: 'experiment',
      accountRevision: 0,
      scopeRevision: 0,
      epoch: 0,
      descriptorHash: 'a'.repeat(64),
      cellDescriptor: {
        platform: 'instagram',
        format: 'text',
        objective: 'engagement',
        exposureSource: 'impressions',
        metricWeights: [['likes', 1]],
        retention: false,
        windowId: '48h-v1',
        configVersion: 'rl-reward-v1-experimental',
        featureSchema: 'numeric-nine-v1',
        armCatalogVersion: 'learning-arms-v1',
      },
      armId: ContentLearningArm.QUESTION_EXAMPLE,
      probabilities: { 'question-example-v1': 1 },
      selectedProbability: 1,
      assignment: 'pilot',
      assignmentProbability: 0.1,
      executionProbability: 0.1,
      executionProbabilities: {
        'question-example-v1': 0.1,
        'baseline-v1': 0.9,
      },
      treatmentProbabilities: { 'question-example-v1': 1 },
      controlProbabilities: { 'baseline-v1': 1 },
      application: {
        status: 'applied',
        reasonCodes: [],
        appliedArmId: ContentLearningArm.QUESTION_EXAMPLE,
        privatePolicyApplied: false,
        sharedReleaseApplied: false,
        revalidatedAt: time,
      },
    };
    const attrs =
      BrandedGenerationReceiptSerializer.serialize(v).data.attributes;
    expect(attrs.learning.privateAccount.application.status).toBe('applied');
    expect(attrs.learning.privateAccount.armId).toBe('question-example-v1');
    expect(attrs.learning.privateAccount.application.privatePolicyApplied).toBe(
      false,
    );
  });
});
