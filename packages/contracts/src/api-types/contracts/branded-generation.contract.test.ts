import { describe, expect, it } from 'vitest';
import type { GenerationHarnessReceipt } from '../../interfaces/content/generation-harness.interface';
import type { IBrandKitDraft } from '../../interfaces/organization/brand-kit.interface';
import {
  type BrandArtifactValidationReportV1,
  type BrandedGenerationReceiptV1,
  type BrandGenerationRulesV1,
  type BrandIdentitySnapshotV1,
  brandArtifactValidationReportV1Schema,
  brandedGenerationInputV1Schema,
  brandedGenerationReceiptV1Schema,
  brandedGenerationResolutionV1Schema,
  brandGenerationLayerReceiptV1Schema,
  brandGenerationRulesV1Schema,
  brandIdentitySnapshotV1Schema,
} from './branded-generation.contract';

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
const input = {
  schemaVersion: 1,
  actorId: 'user',
  organizationId: 'org',
  brandId: 'brand',
  requestKey: ' request ',
  candidateIndex: 0,
  surface: 'api',
  contentType: 'post',
  format: 'text',
  mode: 'approved_brand',
  originalPrompt: 'Original 🎨',
  provider: 'provider',
  model: 'model',
  generationParameters: { temperature: 0 },
  knowledgeSourceIds: [],
  knowledgeSpaceIds: [],
};
describe('immutable branded transport', () => {
  it('keeps legacy brand/harness optional fields absent', () => {
    const oldDraft: IBrandKitDraft = {
      id: 'brand',
      brandId: 'brand',
      status: 'ready',
      sourceType: 'manual',
      fields: {},
      assetCandidates: [],
      evidence: [],
      diagnostics: [],
      readiness: {
        status: 'complete',
        score: 1,
        requiredFields: [],
        missingFields: [],
        diagnostics: [],
      },
    };
    const oldHarness: GenerationHarnessReceipt = {
      originalPrompt: 'x',
      enhancedPrompt: 'x',
      status: 'skipped',
      source: 'default',
      brandId: 'brand',
      appliedPacks: [],
    };
    expect(oldDraft.generationRules).toBeUndefined();
    expect(oldHarness.brandedGenerationReceiptId).toBeUndefined();
  });
  it('preserves exact opaque request bytes', () => {
    expect(brandedGenerationInputV1Schema.parse(input).requestKey).toBe(
      ' request ',
    );
  });
  it('requires provisional draft only in provisional mode', () => {
    expect(
      brandedGenerationInputV1Schema.safeParse({
        ...input,
        mode: 'provisional_brand',
      }).success,
    ).toBe(false);
    expect(
      brandedGenerationInputV1Schema.safeParse({
        ...input,
        mode: 'provisional_brand',
        draftRevisionId: 'draft',
      }).success,
    ).toBe(true);
    expect(
      brandedGenerationInputV1Schema.safeParse({
        ...input,
        draftRevisionId: 'draft',
      }).success,
    ).toBe(false);
  });
  it('accepts matching approved/provisional/raw resolution branches', () => {
    const resolution = {
      schemaVersion: 1,
      status: 'resolved',
      mode: 'approved_brand',
      snapshot: snapshot(),
      compiledPrompt: 'Acme',
      originalPromptHash: hash,
      layers: [],
      learning,
      diagnostics: [],
    };
    expect(
      brandedGenerationResolutionV1Schema.safeParse(resolution).success,
    ).toBe(true);
    expect(
      brandedGenerationResolutionV1Schema.safeParse({
        ...resolution,
        mode: 'provisional_brand',
        snapshot: { ...snapshot(), approval: 'provisional' },
      }).success,
    ).toBe(true);
    expect(
      brandedGenerationResolutionV1Schema.safeParse({
        ...resolution,
        mode: 'raw',
        snapshot: null,
      }).success,
    ).toBe(true);
    expect(
      brandedGenerationResolutionV1Schema.safeParse({
        ...resolution,
        mode: 'raw',
      }).success,
    ).toBe(false);
    expect(
      brandedGenerationResolutionV1Schema.safeParse({
        ...resolution,
        mode: 'provisional_brand',
      }).success,
    ).toBe(false);
  });
  it('blocked cannot carry compiled prompt or lack reason diagnostics', () => {
    const blocked = {
      schemaVersion: 1,
      status: 'blocked',
      mode: 'raw',
      snapshot: null,
      reasonCode: 'context_unavailable',
      diagnostics: [
        {
          code: 'context_unavailable',
          severity: 'error',
          message: 'Unavailable',
        },
      ],
      layers: [],
      learning,
    };
    expect(brandedGenerationResolutionV1Schema.safeParse(blocked).success).toBe(
      true,
    );
    expect(
      brandedGenerationResolutionV1Schema.safeParse({
        ...blocked,
        compiledPrompt: 'x',
      }).success,
    ).toBe(false);
    expect(
      brandedGenerationResolutionV1Schema.safeParse({
        ...blocked,
        diagnostics: [],
      }).success,
    ).toBe(false);
  });
  it('rejects malformed enrichment, dangling evidence and duplicate keyed IDs', () => {
    expect(
      brandGenerationRulesV1Schema.safeParse({ ...rules(), unknown: true })
        .success,
    ).toBe(false);
    expect(
      brandGenerationRulesV1Schema.safeParse({
        ...rules(),
        facts: [{ ...rules().facts[0], evidenceIds: ['missing'] }],
      }).success,
    ).toBe(false);
    expect(
      brandGenerationRulesV1Schema.safeParse({
        ...rules(),
        facts: [...rules().facts, ...rules().facts],
      }).success,
    ).toBe(false);
    expect(
      brandGenerationRulesV1Schema.safeParse({
        ...rules(),
        facts: [{ ...rules().facts[0], kind: 'testimonial' }],
      }).success,
    ).toBe(false);
  });
  it('rejects dangling font assets and invalid owned/runtime claims', () => {
    const font = {
      id: 'font',
      role: 'heading',
      family: 'Custom',
      weight: 400,
      style: 'normal',
      availability: 'owned_asset',
      required: true,
      evidenceIds: ['evidence'],
      fontAssetReferenceId: 'missing',
    };
    expect(
      brandGenerationRulesV1Schema.safeParse({ ...rules(), typography: [font] })
        .success,
    ).toBe(false);
    expect(
      brandGenerationRulesV1Schema.safeParse({
        ...rules(),
        typography: [{ ...font, availability: 'verified_runtime' }],
      }).success,
    ).toBe(false);
    expect(
      brandGenerationRulesV1Schema.safeParse({
        ...rules(),
        typography: [font],
        assets: [
          {
            id: 'missing',
            assetId: 'asset',
            role: 'font',
            required: true,
            evidenceIds: ['evidence'],
          },
        ],
      }).success,
    ).toBe(true);
  });
  it.each([
    'https://user:pass@example.com',
    'https://example.com/#fragment',
    'https://example.com/?token=x',
    'ftp://example.com',
  ])('rejects credential-bearing provenance %s', (url) => {
    expect(
      brandGenerationRulesV1Schema.safeParse({
        ...rules(),
        evidence: [{ ...rules().evidence[0], url }],
      }).success,
    ).toBe(false);
  });
  it('requires canonical palette and finite values', () => {
    const palette = {
      id: 'p',
      color: '#aabbcc',
      usage: 'primary',
      required: true,
      evidenceIds: ['evidence'],
    };
    expect(
      brandGenerationRulesV1Schema.safeParse({ ...rules(), palette: [palette] })
        .success,
    ).toBe(false);
    expect(
      brandGenerationRulesV1Schema.safeParse({
        ...rules(),
        palette: [{ ...palette, color: '#AABBCC' }],
      }).success,
    ).toBe(true);
    expect(
      brandGenerationRulesV1Schema.safeParse({
        ...rules(),
        facts: [{ ...rules().facts[0], value: Infinity }],
      }).success,
    ).toBe(false);
  });
  it('enforces UTF-8 prompt and JSON size/nesting bounds', () => {
    expect(
      brandedGenerationInputV1Schema.safeParse({
        ...input,
        originalPrompt: '🎨'.repeat(16384),
      }).success,
    ).toBe(true);
    expect(
      brandedGenerationInputV1Schema.safeParse({
        ...input,
        originalPrompt: '🎨'.repeat(16385),
      }).success,
    ).toBe(false);
    expect(
      brandedGenerationInputV1Schema.safeParse({
        ...input,
        generationParameters: { x: 'x'.repeat(16384) },
      }).success,
    ).toBe(false);
    let nested: unknown = 'x';
    for (let i = 0; i < 9; i++) nested = { x: nested };
    expect(
      brandedGenerationInputV1Schema.safeParse({
        ...input,
        generationParameters: nested,
      }).success,
    ).toBe(false);
  });
  it('enforces aggregate rule/snapshot byte limits', () => {
    const v = rules();
    v.examples = Array.from({ length: 32 }, (_, i) => ({
      id: `example-${i}`,
      polarity: 'positive',
      text: 'x'.repeat(10000),
      evidenceIds: ['evidence'],
    }));
    expect(brandGenerationRulesV1Schema.safeParse(v).success).toBe(false);
    expect(
      brandIdentitySnapshotV1Schema.safeParse({
        ...snapshot(),
        generationRules: rules(),
        voice: {
          ...snapshot().voice,
          messagingPillars: Array(128).fill('x'.repeat(16000)),
        },
      }).success,
    ).toBe(false);
  });
  it.each([
    { actorId: 'user\n' },
    { requestKey: '' },
    { requestKey: 'x'.repeat(257) },
    { knowledgeSourceIds: ['x', 'x'] },
    { candidateIndex: -1 },
    { policyId: 'override' },
  ])('rejects invalid input %j', (patch) => {
    expect(
      brandedGenerationInputV1Schema.safeParse({ ...input, ...patch }).success,
    ).toBe(false);
  });
  it('applied/truncated layers require evidence and explicit omission state', () => {
    const layer = {
      kind: 'identity',
      id: 'identity',
      contentHash: hash,
      status: 'applied',
      evidenceIds: [],
      omittedIds: [],
    };
    expect(brandGenerationLayerReceiptV1Schema.safeParse(layer).success).toBe(
      true,
    );
    expect(
      brandGenerationLayerReceiptV1Schema.safeParse({
        ...layer,
        contentHash: undefined,
      }).success,
    ).toBe(false);
    expect(
      brandGenerationLayerReceiptV1Schema.safeParse({
        ...layer,
        omittedIds: ['fact'],
      }).success,
    ).toBe(false);
    expect(
      brandGenerationLayerReceiptV1Schema.safeParse({
        ...layer,
        status: 'truncated',
        reasonCode: 'context_budget_exceeded',
        omittedIds: ['fact'],
        budgetBytes: 0,
      }).success,
    ).toBe(true);
  });
});
describe('actual artifact and immutable readiness', () => {
  it('accepts approved ready only with bound validation and retained prompts', () => {
    expect(brandedGenerationReceiptV1Schema.safeParse(receipt()).success).toBe(
      true,
    );
  });
  it.each(['typography', 'logo', 'overlay'] as const)(
    'rejects semantic hard %s pass',
    (category) => {
      expect(
        brandArtifactValidationReportV1Schema.safeParse({
          ...report(),
          checks: [
            { ...report().checks[0], category, method: 'semantic_evaluator' },
          ],
        }).success,
      ).toBe(false);
      expect(
        brandArtifactValidationReportV1Schema.safeParse({
          ...report(),
          checks: [
            { ...report().checks[0], category, method: 'deterministic_render' },
          ],
        }).success,
      ).toBe(true);
    },
  );
  it('quality cannot rescue missing/failing/unknown required hard checks', () => {
    for (const result of [
      'fail',
      'unknown',
      'unsupported',
      'not_applicable',
    ] as const) {
      const v = receipt();
      v.validation = {
        ...report(),
        quality: {
          score: 1,
          confidence: 1,
          evaluatorId: 'eval',
          evaluatorVersion: 1,
          calibrationStatus: 'verified',
        },
        checks: [
          { ...report().checks[0], result, reasonCode: 'validation_failed' },
        ],
      };
      expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(false);
    }
    const v = receipt();
    v.validation = { ...report(), checks: [] };
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(false);
  });
  it('required hard fail is blocked/failed and unknown is review/unverified', () => {
    const v = receipt();
    v.state = 'blocked';
    v.compliance = 'failed';
    v.validation = {
      ...report(),
      checks: [
        {
          ...report().checks[0],
          result: 'fail',
          reasonCode: 'validation_failed',
        },
      ],
    };
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(true);
    v.state = 'needs_review';
    v.compliance = 'unverified';
    v.validation = {
      ...report(),
      checks: [
        {
          ...report().checks[0],
          result: 'unknown',
          reasonCode: 'validation_unavailable',
        },
      ],
    };
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(true);
  });
  it('provisional successful check remains review/unverified', () => {
    const v = receipt();
    v.mode = 'provisional_brand';
    v.snapshot = { ...snapshot(), approval: 'provisional' };
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(false);
    v.state = 'needs_review';
    v.compliance = 'unverified';
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(true);
  });
  it('raw ready may retain hash-only lineage and no compliance claim', () => {
    const v = receipt();
    v.mode = 'raw';
    v.snapshot = null;
    v.validation = null;
    v.compliance = 'not_claimed';
    v.prompts.original = {
      contentHash: hash,
      retention: 'unavailable',
      reasonCode: 'prompt_snapshot_unavailable',
    };
    v.prompts.compiled = { ...v.prompts.original };
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(true);
  });
  it.each([
    'snapshotHash',
    'artifactHash',
    'artifactId',
    'artifactVersion',
  ] as const)('rejects mismatched bound %s', (key) => {
    const v = receipt();
    v.validation = {
      ...report(),
      [key]: key.endsWith('Hash') ? otherHash : 'other',
    };
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(false);
  });
  it('rejects strict dispatch with unavailable retained prompt and duplicate cost IDs', () => {
    const v = receipt();
    v.prompts.original = {
      contentHash: hash,
      retention: 'unavailable',
      reasonCode: 'prompt_snapshot_unavailable',
    };
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(false);
    const x = receipt();
    x.costs = [
      { id: 'cost', stage: 'generation', status: 'pending' },
      { id: 'cost', stage: 'generation', status: 'pending' },
    ];
    expect(brandedGenerationReceiptV1Schema.safeParse(x).success).toBe(false);
  });
  it.each([
    { state: 'created' },
    { state: 'resolved' },
    {
      budget: {
        version: 'brand-enforcement-v1',
        maximumGenerationAttempts: 1,
        automaticPaidRetries: 1,
        generationAttemptsUsed: 1,
      },
    },
    { execution: null },
    { snapshot: { ...snapshot(), organizationId: 'other' } },
    {
      costs: [
        {
          id: 'cost',
          stage: 'generation',
          status: 'unavailable',
          reasonCode: 'ledger_unavailable',
          credits: 0,
        },
      ],
    },
  ])('rejects impossible receipt projection %j', (patch) => {
    expect(
      brandedGenerationReceiptV1Schema.safeParse({ ...receipt(), ...patch })
        .success,
    ).toBe(false);
  });
  it('unknown provider result never resets attempts or becomes ready', () => {
    const v = receipt();
    v.state = 'blocked';
    v.compliance = 'unverified';
    v.artifact = null;
    v.validation = null;
    if (!v.execution) throw new Error('Fixture execution missing');
    v.execution = { ...v.execution, result: 'indeterminate' };
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(true);
    v.budget.generationAttemptsUsed = 0;
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(false);
  });
});

it('retains branded prefixed snapshot/artifact/prompt/resolution hashes', () => {
  const raw = 'a'.repeat(64);
  expect(
    brandIdentitySnapshotV1Schema.safeParse({ ...snapshot(), contentHash: raw })
      .success,
  ).toBe(false);
  for (const patch of [
    { resolutionHash: raw },
    { artifact: { ...receipt().artifact, contentHash: raw } },
    {
      prompts: {
        ...receipt().prompts,
        original: { contentHash: raw, retention: 'retained', snapshotId: 'p' },
      },
    },
  ])
    expect(
      brandedGenerationReceiptV1Schema.safeParse({ ...receipt(), ...patch })
        .success,
    ).toBe(false);
});
