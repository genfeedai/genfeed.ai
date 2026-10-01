import { describe, expect, it } from 'vitest';
import type {
  BrandGenerationLayerVersionV1,
  BrandGenerationMediaKindV1,
} from '../../interfaces/content/branded-generation.interface';
import type { GenerationHarnessReceipt } from '../../interfaces/content/generation-harness.interface';
import type { IBrandKitDraft } from '../../interfaces/organization/brand-kit.interface';
import {
  type BrandApprovedLiteralV1,
  type BrandArtifactValidationReportV1,
  type BrandedGenerationReceiptV1,
  type BrandGenerationRulesV1,
  type BrandIdentitySnapshotV1,
  brandApprovedLiteralV1Schema,
  brandArtifactValidationReportV1Schema,
  brandAssetReferenceV1Schema,
  brandAssetTextCoverageV1Schema,
  brandedGenerationInputV1Schema,
  brandedGenerationReceiptV1Schema,
  brandedGenerationResolutionV1Schema,
  brandGenerationLayerReceiptV1Schema,
  brandGenerationLayerVersionV1Schema,
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

describe('blocked identity and canonical rule origin', () => {
  it('represents unavailable branded identity without fabricated revision', () => {
    const v = {
      schemaVersion: 1,
      status: 'blocked',
      mode: 'approved_brand',
      snapshot: null,
      reasonCode: 'no_approved_revision',
      diagnostics: [
        {
          code: 'no_approved_revision',
          severity: 'error',
          message: 'Approve a persisted revision',
        },
      ],
      layers: [],
      learning,
    };
    expect(brandedGenerationResolutionV1Schema.safeParse(v).success).toBe(true);
    expect(
      brandedGenerationResolutionV1Schema.safeParse({
        ...v,
        status: 'resolved',
        compiledPrompt: 'x',
        originalPromptHash: hash,
        reasonCode: undefined,
      }).success,
    ).toBe(false);
    expect(
      brandedGenerationResolutionV1Schema.safeParse({
        ...v,
        mode: 'provisional_brand',
        snapshot: snapshot(),
      }).success,
    ).toBe(false);
    expect(
      brandedGenerationResolutionV1Schema.safeParse({
        ...v,
        snapshot: { ...snapshot(), approval: 'provisional' },
      }).success,
    ).toBe(false);
    expect(
      brandedGenerationResolutionV1Schema.safeParse({
        ...v,
        layers: [
          {
            kind: 'identity',
            id: 'id',
            version: 1,
            status: 'applied',
            evidenceIds: [],
            omittedIds: [],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      brandedGenerationResolutionV1Schema.safeParse({
        ...v,
        learning: {
          ...learning,
          brandFeedback: {
            status: 'applied',
            profileId: 'p',
            profileVersion: 1,
            contributionHash: hash,
            sourceIds: [],
          },
        },
      }).success,
    ).toBe(false);
    expect(
      brandedGenerationResolutionV1Schema.safeParse({
        ...v,
        layers: [
          {
            kind: 'knowledge',
            id: 'source',
            version: 1,
            status: 'applied',
            evidenceIds: [],
            omittedIds: [],
          },
        ],
      }).success,
    ).toBe(true);
  });
  function visualRuleReceipt(): BrandedGenerationReceiptV1 {
    const v = receipt();
    if (!v.snapshot || !v.validation)
      throw new Error('Missing fixture evidence');
    v.snapshot.generationRules.typography = [
      {
        id: 'font-rule',
        role: 'heading',
        family: 'Custom',
        weight: 400,
        style: 'normal',
        availability: 'verified_runtime',
        runtimeFontId: 'runtime',
        required: true,
        evidenceIds: ['evidence'],
      },
    ];
    v.validation.checks.push({
      ruleId: 'font-rule',
      category: 'typography',
      severity: 'hard',
      result: 'pass',
      method: 'deterministic_render',
      evidenceIds: ['render-manifest'],
    });
    return v;
  }
  it('rejects global rule ID collision across facts/typography', () => {
    const v = visualRuleReceipt();
    if (!v.snapshot) throw new Error('Missing snapshot');
    v.snapshot.generationRules.typography[0].id = 'fact';
    expect(
      brandGenerationRulesV1Schema.safeParse(v.snapshot.generationRules)
        .success,
    ).toBe(false);
  });
  it('requires typography category even when mislabeled check uses exact_text', () => {
    const v = visualRuleReceipt();
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(true);
    if (!v.validation) throw new Error('Missing report');
    v.validation.checks[1] = {
      ...v.validation.checks[1],
      category: 'fact',
      method: 'exact_text',
    };
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(false);
    v.state = 'needs_review';
    v.compliance = 'unverified';
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(false);
  });
  it('requires palette origin category and deterministic proof', () => {
    const v = receipt();
    if (!v.snapshot || !v.validation) throw new Error('Missing evidence');
    v.snapshot.generationRules.palette = [
      {
        id: 'palette',
        color: '#AABBCC',
        usage: 'primary',
        required: true,
        evidenceIds: ['evidence'],
      },
    ];
    v.validation.checks.push({
      ruleId: 'palette',
      category: 'palette',
      severity: 'hard',
      result: 'pass',
      method: 'deterministic_render',
      evidenceIds: ['render'],
    });
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(true);
    v.validation.checks[1].category = 'fact';
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(false);
  });
  it.each([
    ['logo', 'logo'],
    ['font', 'typography'],
    ['product', 'product_identity'],
    ['banner', 'asset_reference'],
    ['style', 'asset_reference'],
  ] as const)('binds %s assets to %s checks', (role, category) => {
    const v = receipt();
    if (!v.snapshot || !v.validation) throw new Error('Missing evidence');
    v.snapshot.generationRules.assets = [
      {
        id: 'asset-rule',
        assetId: 'asset',
        role,
        required: true,
        evidenceIds: ['evidence'],
        contentHash: hash,
      },
    ];
    v.validation.checks.push({
      ruleId: 'asset-rule',
      category,
      severity: 'hard',
      result: 'pass',
      method: 'asset_hash',
      evidenceIds: ['artifact-bound-asset'],
    });
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(true);
    v.validation.checks[1].category =
      category === 'logo' ? 'product_identity' : 'logo';
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(false);
    v.validation.checks[1] = {
      ruleId: 'asset-rule',
      category,
      severity: 'hard',
      result: 'unknown',
      method: 'capability',
      evidenceIds: [],
      reasonCode: 'unsupported_capability',
    };
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(false);
    v.state = 'needs_review';
    v.compliance = 'unverified';
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(true);
  });
  it.each(['mandatory', 'avoid'] as const)(
    'literal %s requires own category and medium-appropriate exact evidence',
    (origin) => {
      const v = receipt();
      if (!v.snapshot || !v.validation || !v.artifact)
        throw new Error('Missing evidence');
      v.snapshot.generationRules[origin] = [
        {
          id: 'text-rule',
          text: 'Acme',
          match: 'literal',
          required: true,
          evidenceIds: ['evidence'],
        },
      ];
      v.validation.checks.push({
        ruleId: 'text-rule',
        category: origin === 'mandatory' ? 'mandatory_rule' : 'avoid_rule',
        severity: 'hard',
        result: 'pass',
        method: 'exact_text',
        evidenceIds: ['artifact-text'],
      });
      expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(true);
      v.validation.checks[1].method = 'human_review';
      expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(false);
      v.validation.checks[1].method = 'exact_text';
      v.artifact.mediaKind = 'image';
      v.validation.checks[0].method = 'deterministic_render';
      expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(false);
      v.validation.checks[1].method = 'deterministic_render';
      expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(true);
    },
  );
  it('semantic pass requires evaluator identity/version and never substitutes for literal match', () => {
    const v = receipt();
    if (!v.snapshot || !v.validation) throw new Error('Missing evidence');
    v.snapshot.generationRules.facts[0].match = 'semantic';
    v.validation.checks[0].method = 'semantic_evaluator';
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(false);
    v.validation.checks[0].evaluatorId = 'eval';
    v.validation.checks[0].evaluatorVersion = 1;
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(true);
    v.snapshot.generationRules.facts[0].match = 'literal';
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(false);
  });
  it.each(['fail', 'unknown', 'unsupported'] as const)(
    'additional hard %s prevents ready',
    (result) => {
      const v = receipt();
      if (!v.validation) throw new Error('Missing report');
      v.validation.checks.push({
        ruleId: 'extra-artifact-check',
        category: 'fact',
        severity: 'hard',
        result,
        method: 'capability',
        evidenceIds: [],
        reasonCode: 'validation_failed',
      });
      expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(false);
      v.state = result === 'fail' ? 'blocked' : 'needs_review';
      v.compliance = result === 'fail' ? 'failed' : 'unverified';
      expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(true);
    },
  );
});
it('rejects an oversized receipt projection without truncating lineage', () => {
  const v = receipt();
  v.layers = Array.from({ length: 20 }, (_, i) => ({
    kind: 'knowledge',
    id: `layer-${i}`,
    status: 'truncated',
    reasonCode: 'context_budget_exceeded',
    budgetBytes: 0,
    evidenceIds: [],
    omittedIds: Array.from(
      { length: 256 },
      (_, j) => `${j}-${'x'.repeat(240)}`,
    ),
  }));
  expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(false);
});

describe('lossless source layer versions', () => {
  const layer = {
    kind: 'pack',
    id: 'brand-fidelity',
    version: '1.0.0',
    status: 'applied',
    evidenceIds: [],
    omittedIds: [],
  };
  it('accepts actual loaded pack version unchanged and retains numeric/string identity', () => {
    expect(brandGenerationLayerReceiptV1Schema.parse(layer).version).toBe(
      '1.0.0',
    );
    const numeric: BrandGenerationLayerVersionV1 = 1;
    const opaque: BrandGenerationLayerVersionV1 = '1';
    expect(brandGenerationLayerVersionV1Schema.parse(numeric)).toBe(1);
    expect(brandGenerationLayerVersionV1Schema.parse(opaque)).toBe('1');
    expect(
      brandGenerationLayerReceiptV1Schema.parse({ ...layer, version: numeric })
        .version,
    ).toBe(1);
    expect(
      brandGenerationLayerReceiptV1Schema.parse({
        ...layer,
        version: Number.MAX_SAFE_INTEGER,
      }).version,
    ).toBe(Number.MAX_SAFE_INTEGER);
  });
  it.each([
    '1',
    '1.0.0',
    'v1.0.0',
    '1.0.0-beta.2',
    '1.0.0+build.42',
    'release 2026-10-01',
    ' 1.0.0 ',
    'x'.repeat(256),
  ])('preserves bounded opaque version %s exactly', (value) => {
    expect(brandGenerationLayerVersionV1Schema.parse(value)).toBe(value);
    expect(
      brandGenerationLayerReceiptV1Schema.parse({ ...layer, version: value })
        .version,
    ).toBe(value);
  });
  it.each([
    '',
    ' ',
    '\t',
    '\n',
    '\u00a0',
    '\u2003',
    '\u0000version',
    'version\u001f',
    'version\u007f',
    'version\u0085',
    'version\u009f',
    'x'.repeat(257),
  ])('rejects blank/control/oversize version %j', (value) => {
    expect(brandGenerationLayerVersionV1Schema.safeParse(value).success).toBe(
      false,
    );
    expect(
      brandGenerationLayerReceiptV1Schema.safeParse({
        ...layer,
        version: value,
        contentHash: hash,
      }).success,
    ).toBe(false);
  });
  it.each([0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, -Infinity])(
    'rejects invalid numeric version %s',
    (value) => {
      expect(brandGenerationLayerVersionV1Schema.safeParse(value).success).toBe(
        false,
      );
      expect(
        brandGenerationLayerReceiptV1Schema.safeParse({
          ...layer,
          version: value,
        }).success,
      ).toBe(false);
    },
  );
  it('keeps applied source ID and version-or-hash requirements', () => {
    expect(
      brandGenerationLayerReceiptV1Schema.safeParse({ ...layer, id: undefined })
        .success,
    ).toBe(false);
    expect(
      brandGenerationLayerReceiptV1Schema.safeParse({
        ...layer,
        version: undefined,
      }).success,
    ).toBe(false);
    expect(
      brandGenerationLayerReceiptV1Schema.safeParse({
        ...layer,
        version: undefined,
        contentHash: hash,
      }).success,
    ).toBe(true);
    expect(
      brandGenerationLayerReceiptV1Schema.safeParse({
        ...layer,
        omittedIds: ['rule'],
      }).success,
    ).toBe(false);
  });
  it('retains semantic pack version in complete resolution and saved receipt fixtures', () => {
    const saved = { ...receipt(), layers: [layer] };
    const before = structuredClone(saved);
    const parsed = brandedGenerationReceiptV1Schema.parse(saved);
    expect(parsed.layers[0].version).toBe('1.0.0');
    expect(parsed.snapshot).toEqual(saved.snapshot);
    expect(parsed.learning).toEqual(saved.learning);
    const resolved = brandedGenerationResolutionV1Schema.parse({
      schemaVersion: 1,
      status: 'resolved',
      mode: 'approved_brand',
      snapshot: snapshot(),
      compiledPrompt: 'Acme',
      originalPromptHash: hash,
      layers: [layer],
      learning,
      diagnostics: [],
    });
    expect(resolved.layers[0].version).toBe('1.0.0');
    expect(saved).toEqual(before);
  });
  it('leaves identity, evidence, evaluator, capability and learning counters numeric', () => {
    expect(
      brandIdentitySnapshotV1Schema.safeParse({
        ...snapshot(),
        revisionVersion: '1',
      }).success,
    ).toBe(false);
    const guide = snapshot();
    guide.generationRules.evidence = [
      { ...guide.generationRules.evidence[0], sourceVersion: 1 },
    ];
    expect(
      brandIdentitySnapshotV1Schema.safeParse({
        ...guide,
        generationRules: {
          ...guide.generationRules,
          evidence: [
            { ...guide.generationRules.evidence[0], sourceVersion: '1.0.0' },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      brandArtifactValidationReportV1Schema.safeParse({
        ...report(),
        rubricVersion: '1',
      }).success,
    ).toBe(false);
    expect(
      brandArtifactValidationReportV1Schema.safeParse({
        ...report(),
        checks: [{ ...report().checks[0], evaluatorVersion: '1' }],
      }).success,
    ).toBe(false);
    expect(
      brandedGenerationReceiptV1Schema.safeParse({
        ...receipt(),
        execution: { ...receipt().execution, capabilityVersion: '1' },
      }).success,
    ).toBe(false);
    expect(
      brandedGenerationReceiptV1Schema.safeParse({
        ...receipt(),
        learning: {
          ...learning,
          privateAccount: { ...learning.privateAccount, accountRevision: '1' },
        },
      }).success,
    ).toBe(false);
    expect(
      brandedGenerationReceiptV1Schema.safeParse({
        ...receipt(),
        learning: {
          ...learning,
          global: { ...learning.global, releaseRevision: '1' },
        },
      }).success,
    ).toBe(false);
  });
});

describe('explicit owner rule media applicability', () => {
  function fontReceipt() {
    const v = receipt();
    if (!v.snapshot || !v.validation || !v.artifact)
      throw new Error('Missing fixture evidence');
    v.snapshot.generationRules.typography = [
      {
        id: 'font-rule',
        role: 'heading',
        family: 'Custom',
        weight: 400,
        style: 'normal',
        availability: 'verified_runtime',
        runtimeFontId: 'runtime',
        required: true,
        evidenceIds: ['evidence'],
      },
    ];
    return {
      ...v,
      snapshot: v.snapshot,
      validation: v.validation,
      artifact: v.artifact,
    };
  }
  function excludedReceipt() {
    const v = fontReceipt();
    v.snapshot.generationRules.typography[0].appliesToMediaKinds = [
      'image',
      'video',
    ];
    return v;
  }
  function excludedCheck(): BrandArtifactValidationReportV1['checks'][number] {
    return {
      ruleId: 'font-rule',
      category: 'typography',
      severity: 'hard',
      result: 'not_applicable',
      method: 'capability',
      reasonCode: 'rule_media_not_applicable',
      evidenceIds: [],
    };
  }
  it('omission is universal; explicit scope permits text without a font check', () => {
    const medium: BrandGenerationMediaKindV1 = 'text';
    expect(fontReceipt().artifact.mediaKind).toBe(medium);
    expect(
      brandedGenerationReceiptV1Schema.safeParse(fontReceipt()).success,
    ).toBe(false);
    expect(
      brandedGenerationReceiptV1Schema.safeParse(excludedReceipt()).success,
    ).toBe(true);
    const v = excludedReceipt();
    v.validation.checks.push(excludedCheck());
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(true);
  });
  it('the same rule still requires actual qualified coverage for image', () => {
    const v = excludedReceipt();
    v.artifact.mediaKind = 'image';
    v.validation.checks[0].method = 'deterministic_render';
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(false);
    v.validation.checks.push({
      ...excludedCheck(),
      result: 'pass',
      method: 'deterministic_render',
      reasonCode: undefined,
      evidenceIds: ['render-manifest'],
    });
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(true);
    v.validation.checks[1] = excludedCheck();
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(false);
  });
  it.each([
    [],
    ['image', 'image'],
    ['audio'],
    ['text', 'image', 'video', 'image'],
  ])('rejects invalid applicability %j', (scope) => {
    const v = excludedReceipt();
    expect(
      brandGenerationRulesV1Schema.safeParse({
        ...v.snapshot.generationRules,
        typography: [
          {
            ...v.snapshot.generationRules.typography[0],
            appliesToMediaKinds: scope,
          },
        ],
      }).success,
    ).toBe(false);
  });
  it('supports explicit scope on every owner rule origin without narrowing by category', () => {
    const v = excludedReceipt();
    const r = v.snapshot.generationRules;
    r.facts[0].appliesToMediaKinds = ['image'];
    r.palette = [
      {
        id: 'palette',
        color: '#ABCDEF',
        usage: 'primary',
        required: true,
        evidenceIds: ['evidence'],
        appliesToMediaKinds: ['image'],
      },
    ];
    r.mandatory = [
      {
        id: 'mandatory',
        text: 'Acme',
        match: 'literal',
        required: true,
        evidenceIds: ['evidence'],
        appliesToMediaKinds: ['image'],
      },
    ];
    r.avoid = [
      {
        id: 'avoid',
        text: 'Forbidden',
        match: 'literal',
        required: true,
        evidenceIds: ['evidence'],
        appliesToMediaKinds: ['image'],
      },
    ];
    r.assets = [
      {
        id: 'logo',
        assetId: 'asset',
        role: 'logo',
        required: true,
        evidenceIds: ['evidence'],
        appliesToMediaKinds: ['image'],
      },
    ];
    v.validation.checks = [];
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(true);
    v.validation.checks.push({
      ruleId: 'mandatory',
      category: 'mandatory_rule',
      severity: 'hard',
      result: 'not_applicable',
      method: 'capability',
      reasonCode: 'rule_media_not_applicable',
      evidenceIds: [],
    });
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(true);
    r.mandatory[0].appliesToMediaKinds = undefined;
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(false);
  });
  it('does not add applicability to examples or evidence', () => {
    const r = rules();
    expect(
      brandGenerationRulesV1Schema.safeParse({
        ...r,
        evidence: [{ ...r.evidence[0], appliesToMediaKinds: ['text'] }],
      }).success,
    ).toBe(false);
    expect(
      brandGenerationRulesV1Schema.safeParse({
        ...r,
        examples: [
          {
            id: 'example',
            polarity: 'positive',
            text: 'Acme',
            evidenceIds: ['evidence'],
            appliesToMediaKinds: ['text'],
          },
        ],
      }).success,
    ).toBe(false);
  });
  it.each(['ready', 'checking', 'needs_review', 'blocked'] as const)(
    'enforces excluded checks in %s',
    (state) => {
      const mutations = [
        { result: 'pass' },
        { result: 'fail' },
        { result: 'unknown' },
        { result: 'unsupported' },
        { category: 'fact' },
        { method: 'exact_text' },
        { severity: 'soft' },
        { reasonCode: 'other' },
      ];
      for (const mutation of mutations) {
        const v = excludedReceipt();
        v.state = state;
        v.compliance = state === 'ready' ? 'passed' : 'unverified';
        v.validation.checks.push({
          ...excludedCheck(),
          ...mutation,
        } as BrandArtifactValidationReportV1['checks'][number]);
        expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(
          false,
        );
      }
    },
  );
  it('optional excluded rules use soft severity', () => {
    const v = excludedReceipt();
    v.snapshot.generationRules.typography[0].required = false;
    v.validation.checks.push({ ...excludedCheck(), severity: 'soft' });
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(true);
    v.validation.checks[1].severity = 'hard';
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(false);
  });
  it.each(['unknown', 'fail'] as const)(
    'preserves synthetic hard %s and provisional guards',
    (result) => {
      const v = excludedReceipt();
      v.validation.checks.push({
        ...excludedCheck(),
        ruleId: 'system:factual_coverage',
        result,
      });
      expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(false);
      v.validation.checks.pop();
      v.mode = 'provisional_brand';
      expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(false);
    },
  );
  it('does not exempt unknown applicable required evidence', () => {
    const v = excludedReceipt();
    v.validation.checks[0].result = 'unknown';
    expect(brandedGenerationReceiptV1Schema.safeParse(v).success).toBe(false);
  });
});

function approvedRules(): BrandGenerationRulesV1 {
  return {
    ...rules(),
    approvedLiterals: [
      {
        id: 'literal:fact',
        kind: 'fact',
        text: 'Acme',
        factRuleId: 'fact',
        evidenceIds: ['evidence'],
      },
      {
        id: 'literal:copy',
        kind: 'approved_copy',
        text: '  Complete\twording\r\n🎨  ',
        evidenceIds: ['evidence'],
      },
    ],
    assets: [
      {
        id: 'asset',
        assetId: 'saved-image',
        role: 'logo',
        contentHash: hash,
        required: true,
        evidenceIds: ['evidence'],
        textCoverage: {
          kind: 'approved_literals',
          literalIds: ['literal:fact', 'literal:copy'],
          evidenceIds: ['evidence'],
        },
      },
    ],
  };
}

describe('approved literal and asset text catalogue', () => {
  const copy: BrandApprovedLiteralV1 = {
    id: 'literal:copy',
    kind: 'approved_copy',
    text: 'Exact wording',
    evidenceIds: ['evidence'],
  };
  it('preserves absent legacy fields without constructing a catalogue or inventory', () => {
    const legacy = rules();
    legacy.assets = [
      {
        id: 'asset',
        assetId: 'saved-image',
        role: 'logo',
        required: false,
        evidenceIds: ['evidence'],
      },
    ];
    const parsed = brandGenerationRulesV1Schema.parse(legacy);
    expect(parsed).not.toHaveProperty('approvedLiterals');
    expect(parsed.assets[0]).not.toHaveProperty('textCoverage');
  });
  it('preserves complete wording and owner order for both literal variants', () => {
    const value = approvedRules();
    expect(brandGenerationRulesV1Schema.parse(value)).toEqual(value);
  });
  it.each([
    'literal:',
    'copy',
    'literal:bad\u0000',
    'literal:bad\u007f',
    `literal:${'x'.repeat(249)}`,
  ])('rejects invalid literal ID %j', (value) => {
    expect(
      brandApprovedLiteralV1Schema.safeParse({ ...copy, id: value }).success,
    ).toBe(false);
  });
  it('accepts the canonical 256-character ID boundary', () => {
    expect(
      brandApprovedLiteralV1Schema.safeParse({
        ...copy,
        id: `literal:${'x'.repeat(248)}`,
      }).success,
    ).toBe(true);
  });
  it.each([
    '',
    ' \t\r\n',
    'bad\u0000',
    'bad\u000b',
    'bad\u000c',
    'bad\u001f',
    'bad\u007f',
    'bad\u0085',
    'x'.repeat(4001),
  ])('rejects empty, control or oversized wording %j', (text) => {
    expect(
      brandApprovedLiteralV1Schema.safeParse({ ...copy, text }).success,
    ).toBe(false);
  });
  it('bounds unique supporting references at 256 entries', () => {
    const evidenceIds = Array.from(
      { length: 256 },
      (_, index) => `evidence:${index}`,
    );
    expect(
      brandApprovedLiteralV1Schema.safeParse({ ...copy, evidenceIds }).success,
    ).toBe(true);
    expect(
      brandAssetTextCoverageV1Schema.safeParse({
        kind: 'none',
        literalIds: [],
        evidenceIds,
      }).success,
    ).toBe(true);
    evidenceIds.push('evidence:256');
    expect(
      brandApprovedLiteralV1Schema.safeParse({ ...copy, evidenceIds }).success,
    ).toBe(false);
    expect(
      brandAssetTextCoverageV1Schema.safeParse({
        kind: 'none',
        literalIds: [],
        evidenceIds,
      }).success,
    ).toBe(false);
  });
  it('measures literal length in UTF-16 units and preserves allowed whitespace', () => {
    expect(
      brandApprovedLiteralV1Schema.parse({ ...copy, text: '🎨'.repeat(2000) })
        .text,
    ).toHaveLength(4000);
    expect(
      brandApprovedLiteralV1Schema.safeParse({
        ...copy,
        text: '🎨'.repeat(2001),
      }).success,
    ).toBe(false);
  });
  it.each([
    { ...copy, unexpected: true },
    { ...copy, factRuleId: 'fact' },
    { ...copy, kind: 'fact' },
    { ...copy, evidenceIds: [] },
    { ...copy, evidenceIds: ['evidence', 'evidence'] },
  ])('rejects malformed literal shape %#', (value) => {
    expect(brandApprovedLiteralV1Schema.safeParse(value).success).toBe(false);
  });
  it('rejects unresolved literal evidence and facts, and missing linked fact evidence', () => {
    const value = approvedRules();
    value.assets = [];
    value.approvedLiterals = [{ ...copy, evidenceIds: ['missing'] }];
    expect(brandGenerationRulesV1Schema.safeParse(value).success).toBe(false);
    value.approvedLiterals = [{ ...copy, kind: 'fact', factRuleId: 'missing' }];
    expect(brandGenerationRulesV1Schema.safeParse(value).success).toBe(false);
    value.evidence.push({
      id: 'second',
      sourceType: 'manual',
      label: 'Additional owner evidence',
    });
    value.facts[0].evidenceIds.push('second');
    value.approvedLiterals = [{ ...copy, kind: 'fact', factRuleId: 'fact' }];
    expect(brandGenerationRulesV1Schema.safeParse(value).success).toBe(false);
    value.approvedLiterals[0].evidenceIds.push('second');
    expect(brandGenerationRulesV1Schema.safeParse(value).success).toBe(true);
  });
  it.each(['evidence', 'fact', 'example'] as const)(
    'rejects literal ID collision with %s',
    (category) => {
      const value = rules();
      value.approvedLiterals = [copy];
      if (category === 'evidence') {
        value.evidence.push({
          id: copy.id,
          sourceType: 'manual',
          label: 'Owner',
        });
      }
      if (category === 'fact') {
        value.facts[0].id = copy.id;
      }
      if (category === 'example') {
        value.examples.push({
          id: copy.id,
          polarity: 'positive',
          text: 'Example',
          evidenceIds: ['evidence'],
        });
      }
      expect(brandGenerationRulesV1Schema.safeParse(value).success).toBe(false);
    },
  );
  it('rejects duplicate literal IDs and catalogues above 128 entries', () => {
    const value = rules();
    value.approvedLiterals = [copy, copy];
    expect(brandGenerationRulesV1Schema.safeParse(value).success).toBe(false);
    value.approvedLiterals = Array.from({ length: 128 }, (_, index) => ({
      ...copy,
      id: `literal:${index}`,
    }));
    expect(brandGenerationRulesV1Schema.safeParse(value).success).toBe(true);
    value.approvedLiterals = Array.from({ length: 129 }, (_, index) => ({
      ...copy,
      id: `literal:${index}`,
    }));
    expect(brandGenerationRulesV1Schema.safeParse(value).success).toBe(false);
  });
  it('keeps the aggregate UTF-8 cap even when each literal fits its character cap', () => {
    const value = rules();
    value.approvedLiterals = Array.from({ length: 128 }, (_, index) => ({
      ...copy,
      id: `literal:${index}`,
      text: '🎨'.repeat(500),
    }));
    expect(
      new TextEncoder().encode(JSON.stringify(value)).byteLength,
    ).toBeGreaterThan(250000);
    expect(brandGenerationRulesV1Schema.safeParse(value).success).toBe(false);
  });
  it('accepts both explicit coverage modes without inventing renderer capabilities', () => {
    expect(
      brandAssetTextCoverageV1Schema.parse({
        kind: 'none',
        literalIds: [],
        evidenceIds: ['evidence'],
      }).kind,
    ).toBe('none');
    const value = approvedRules();
    value.assets[0].mimeType = 'image/jpeg';
    expect(brandGenerationRulesV1Schema.safeParse(value).success).toBe(true);
  });
  it.each([
    { kind: 'none', literalIds: ['literal:copy'], evidenceIds: ['evidence'] },
    { kind: 'approved_literals', literalIds: [], evidenceIds: ['evidence'] },
    {
      kind: 'approved_literals',
      literalIds: ['literal:copy', 'literal:copy'],
      evidenceIds: ['evidence'],
    },
    { kind: 'none', literalIds: [], evidenceIds: [] },
    { kind: 'none', literalIds: [], evidenceIds: ['evidence', 'evidence'] },
    { kind: 'none', literalIds: [], evidenceIds: ['evidence'], extra: true },
    {
      kind: 'approved_literals',
      literalIds: ['invalid'],
      evidenceIds: ['evidence'],
    },
    {
      kind: 'approved_literals',
      literalIds: Array.from({ length: 129 }, (_, index) => `literal:${index}`),
      evidenceIds: ['evidence'],
    },
  ])('rejects malformed coverage %#', (coverage) => {
    expect(brandAssetTextCoverageV1Schema.safeParse(coverage).success).toBe(
      false,
    );
  });
  it('rejects font coverage and coverage without an exact content hash', () => {
    const asset = approvedRules().assets[0];
    expect(
      brandAssetReferenceV1Schema.safeParse({ ...asset, role: 'font' }).success,
    ).toBe(false);
    expect(
      brandAssetReferenceV1Schema.safeParse({
        ...asset,
        contentHash: undefined,
      }).success,
    ).toBe(false);
  });
  it('rejects unresolved coverage literal and evidence references', () => {
    const value = approvedRules();
    value.assets[0].textCoverage = {
      kind: 'approved_literals',
      literalIds: ['literal:missing'],
      evidenceIds: ['evidence'],
    };
    expect(brandGenerationRulesV1Schema.safeParse(value).success).toBe(false);
    value.assets[0].textCoverage = {
      kind: 'none',
      literalIds: [],
      evidenceIds: ['missing'],
    };
    expect(brandGenerationRulesV1Schema.safeParse(value).success).toBe(false);
  });
});
