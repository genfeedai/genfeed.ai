import { describe, expect, it } from 'vitest';
import type { BrandGenerationLayerVersionV1 } from '../../interfaces/content/branded-generation.interface';
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
