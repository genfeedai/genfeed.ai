import {
  type BrandedGenerationHashDomainV1,
  type BrandedGenerationJsonV1,
  canonicalizeBrandedGenerationJsonV1,
  hashBrandArtifactValidationReportV1,
  hashBrandedGenerationArtifactManifestV1,
  hashBrandedGenerationJsonV1,
  hashBrandedGenerationOperationV1,
  hashBrandedGenerationRequestV1,
  hashBrandedGenerationResolutionV1,
  hashBrandedGenerationTextV1,
  hashBrandGenerationRulesReviewV1,
  hashBrandIdentitySnapshotV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import type { BrandedGenerationOperationKindV1 } from '@api/services/branded-generation-receipts/branded-generation-state.util';
import { ContentLearningArm } from '@genfeedai/contracts/enums';
import type {
  BrandArtifactValidationReportV1,
  BrandedGenerationInputV1,
  BrandedGenerationResolutionV1,
  BrandGenerationRulesV1,
  BrandIdentitySnapshotV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { describe, expect, it, vi } from 'vitest';

const hash = `sha256:${'a'.repeat(64)}`;
const time = '2026-10-01T00:00:00.000Z';
function snapshot(): Omit<BrandIdentitySnapshotV1, 'contentHash'> {
  return {
    schemaVersion: 1,
    organizationId: 'org',
    brandId: 'brand',
    revisionId: 'revision',
    revisionVersion: 1,
    approval: 'approved',
    resolvedAt: time,
    identity: { name: 'Acme', description: undefined },
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
}
function input(): BrandedGenerationInputV1 {
  return {
    schemaVersion: 1,
    actorId: 'user',
    organizationId: 'org',
    brandId: 'brand',
    requestKey: 'key',
    candidateIndex: 0,
    surface: 'api',
    contentType: 'post',
    format: 'text',
    mode: 'approved_brand',
    originalPrompt: 'Exact 🎨\r\n',
    provider: 'provider',
    model: 'model',
    generationParameters: { array: ['z', 'a'], temperature: 0 },
    knowledgeSourceIds: ['z', 'a'],
    knowledgeSpaceIds: ['two', 'one'],
  };
}
function resolution(): BrandedGenerationResolutionV1 {
  return {
    schemaVersion: 1,
    status: 'resolved',
    mode: 'approved_brand',
    snapshot: { ...snapshot(), contentHash: hash },
    compiledPrompt: 'Acme',
    originalPromptHash: hash,
    layers: [],
    diagnostics: [],
    learning: {
      schemaVersion: 1,
      brandFeedback: { status: 'not_applicable', sourceIds: [] },
      global: {
        status: 'not_applicable',
        scope: { format: 'text', objective: 'engagement' },
        revalidatedAt: time,
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
  };
}
function report(): BrandArtifactValidationReportV1 {
  return {
    schemaVersion: 1,
    id: 'report',
    rubricVersion: 1,
    snapshotHash: hash,
    artifactHash: hash,
    artifactId: 'artifact',
    artifactVersion: '1',
    checkedAt: time,
    checks: [
      {
        ruleId: 'fact',
        category: 'fact',
        severity: 'hard',
        result: 'unknown',
        method: 'capability',
        evidenceIds: [],
        reasonCode: 'validation_unavailable',
      },
    ],
    quality: null,
    diagnostics: [
      {
        code: 'validation_unavailable',
        severity: 'warning',
        message: 'Unavailable',
        ruleId: 'fact',
        evidenceIds: [],
      },
    ],
  };
}
describe('strict canonical JSON and exact hashes', () => {
  it('matches known SHA256 text fixture without domain prefix', () => {
    expect(hashBrandedGenerationTextV1('abc')).toBe(
      'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
  it('sorts numeric-looking keys by code units directly', () => {
    expect(
      canonicalizeBrandedGenerationJsonV1({
        '2': 'two',
        '10': 'ten',
        z: 0,
        a: 1,
      }),
    ).toBe('{"10":"ten","2":"two","a":1,"z":0}');
    expect(
      hashBrandedGenerationJsonV1('brand-identity-v1', { z: 1, a: 2 }),
    ).toBe(hashBrandedGenerationJsonV1('brand-identity-v1', { a: 2, z: 1 }));
  });
  it('preserves arrays/scalars and domain separation', () => {
    expect(
      canonicalizeBrandedGenerationJsonV1({ x: [true, null, -0, '\n'] }),
    ).toBe('{"x":[true,null,0,"\\n"]}');
    expect(
      hashBrandedGenerationJsonV1('brand-identity-v1', ['a', 'b']),
    ).not.toBe(hashBrandedGenerationJsonV1('brand-identity-v1', ['b', 'a']));
    expect(hashBrandedGenerationJsonV1('brand-identity-v1', {})).not.toBe(
      hashBrandedGenerationJsonV1('generation-request-v1', {}),
    );
  });
  it('preserves whitespace, line endings and Unicode normalization', () => {
    for (const [a, b] of [
      ['abc', ' abc'],
      ['x\n', 'x\r\n'],
      ['é', 'e\u0301'],
    ])
      expect(hashBrandedGenerationTextV1(a)).not.toBe(
        hashBrandedGenerationTextV1(b),
      );
  });
  it.each([
    undefined,
    NaN,
    Infinity,
    -Infinity,
    1n,
    () => 0,
    Symbol('secret'),
    new Date(),
    new Map(),
    new Set(),
    new (class {
      value = 1;
    })(),
  ])('rejects unsupported JSON %s safely', (value) => {
    expect(() =>
      canonicalizeBrandedGenerationJsonV1(value as BrandedGenerationJsonV1),
    ).toThrow(new TypeError('Invalid branded generation JSON'));
  });
  it('rejects undefined object/array members and sparse/extra arrays', () => {
    const extra: number[] & { extra?: number } = [1];
    extra.extra = 2;
    for (const v of [{ x: undefined }, [undefined], new Array(1), extra])
      expect(() =>
        canonicalizeBrandedGenerationJsonV1(v as BrandedGenerationJsonV1),
      ).toThrow('Invalid branded generation JSON');
  });
  it('rejects object/array accessors without invoking them', () => {
    let calls = 0;
    for (const v of [{}, [1]]) {
      Object.defineProperty(v, Array.isArray(v) ? '0' : 'x', {
        enumerable: true,
        get() {
          calls++;
          return 1;
        },
      });
      expect(() => canonicalizeBrandedGenerationJsonV1(v)).toThrow(
        'Invalid branded generation JSON',
      );
    }
    expect(calls).toBe(0);
  });
  it('rejects symbol/nonenumerable/forbidden keys', () => {
    const symbol = { [Symbol('secret')]: 1 };
    const hidden = Object.defineProperty({}, 'hidden', {
      value: 1,
      enumerable: false,
    });
    for (const v of [
      symbol,
      hidden,
      JSON.parse('{"__proto__":0}'),
      { nested: { constructor: 0 } },
      { prototype: 0 },
    ])
      expect(() => canonicalizeBrandedGenerationJsonV1(v)).toThrow(
        'Invalid branded generation JSON',
      );
  });
  it('rejects cycles but permits repeated noncyclic and null-prototype objects', () => {
    const cycle: { child?: unknown } = {};
    cycle.child = cycle;
    expect(() =>
      canonicalizeBrandedGenerationJsonV1(cycle as BrandedGenerationJsonV1),
    ).toThrow('Invalid branded generation JSON');
    const shared = { x: 1 };
    expect(canonicalizeBrandedGenerationJsonV1({ a: shared, b: shared })).toBe(
      '{"a":{"x":1},"b":{"x":1}}',
    );
    const plain = Object.assign(Object.create(null), { x: 1 });
    expect(canonicalizeBrandedGenerationJsonV1(plain)).toBe('{"x":1}');
  });
  it('accepts depth16 and rejects depth17', () => {
    let v: BrandedGenerationJsonV1 = 0;
    for (let i = 0; i < 16; i++) v = { x: v };
    expect(() => canonicalizeBrandedGenerationJsonV1(v)).not.toThrow();
    expect(() => canonicalizeBrandedGenerationJsonV1({ x: v })).toThrow(
      'Invalid branded generation JSON',
    );
  });
  it('rejects unknown domains and operation kinds at runtime', () => {
    expect(() =>
      hashBrandedGenerationJsonV1(
        'unknown' as BrandedGenerationHashDomainV1,
        {},
      ),
    ).toThrow('Invalid branded generation JSON');
    expect(() =>
      hashBrandedGenerationOperationV1(
        'unknown' as BrandedGenerationOperationKindV1,
        {},
      ),
    ).toThrow('Invalid branded generation JSON');
  });
});
describe('frozen typed hash projections', () => {
  it('identity is clock/diagnostic stable and scope/revision/content sensitive', () => {
    const v = snapshot();
    const before = structuredClone(v);
    const digest = hashBrandIdentitySnapshotV1(v);
    expect(
      hashBrandIdentitySnapshotV1({
        ...v,
        resolvedAt: '2027-01-01T00:00:00.000Z',
        diagnostics: [
          {
            code: 'legacy_rules_unavailable',
            severity: 'info',
            message: 'Different prose',
          },
        ],
      }),
    ).toBe(digest);
    for (const patch of [
      { organizationId: 'other' },
      { brandId: 'other' },
      { revisionId: 'other' },
      { revisionVersion: 2 },
      { approval: 'provisional' as const },
      { identity: { name: 'Other' } },
    ])
      expect(hashBrandIdentitySnapshotV1({ ...v, ...patch })).not.toBe(digest);
    expect(v).toEqual(before);
  });
  it('request normalizes Knowledge sets while excluding logical key lineage', () => {
    const v = input();
    const before = structuredClone(v);
    const digest = hashBrandedGenerationRequestV1(v);
    expect(
      hashBrandedGenerationRequestV1({
        ...v,
        requestKey: 'other',
        candidateIndex: 1,
        parentRequestId: 'parent',
        runId: 'run',
        workflowExecutionId: 'workflow',
        generationId: 'generation',
        knowledgeSourceIds: ['a', 'z'],
        knowledgeSpaceIds: ['one', 'two'],
      }),
    ).toBe(digest);
    for (const patch of [
      { actorId: 'other' },
      { originalPrompt: 'different' },
      { model: 'other' },
      { generationParameters: { array: ['a', 'z'] } },
    ])
      expect(hashBrandedGenerationRequestV1({ ...v, ...patch })).not.toBe(
        digest,
      );
    expect(v).toEqual(before);
  });
  it('request validates unknown fields and duplicated Knowledge before hashing', () => {
    expect(() =>
      hashBrandedGenerationRequestV1({
        ...input(),
        knowledgeSourceIds: ['x', 'x'],
      }),
    ).toThrow();
    expect(() =>
      hashBrandedGenerationRequestV1({
        ...input(),
        policyId: 'client-override',
      } as BrandedGenerationInputV1),
    ).toThrow();
  });
  it('resolution retains selection/application evidence but drops revalidation clocks', () => {
    const v = resolution();
    const before = structuredClone(v);
    const changed = structuredClone(v);
    changed.diagnostics = [
      {
        code: 'context_unavailable',
        severity: 'info',
        message: 'Different wording',
      },
    ];
    if (changed.learning.privateAccount.application)
      changed.learning.privateAccount.application.revalidatedAt =
        '2027-01-01T00:00:00.000Z';
    changed.learning.global.revalidatedAt = '2027-01-01T00:00:00.000Z';
    expect(hashBrandedGenerationResolutionV1(changed)).toBe(
      hashBrandedGenerationResolutionV1(v),
    );
    changed.learning.privateAccount.reason = 'learning_control_changed';
    expect(hashBrandedGenerationResolutionV1(changed)).not.toBe(
      hashBrandedGenerationResolutionV1(v),
    );
    expect(v).toEqual(before);
  });
  it('blockednull hashes reason without fabricating compiled text', () => {
    const v = resolution();
    const blocked: BrandedGenerationResolutionV1 = {
      schemaVersion: 1,
      status: 'blocked',
      mode: 'approved_brand',
      snapshot: null,
      layers: [],
      learning: v.learning,
      reasonCode: 'no_approved_revision',
      diagnostics: [
        {
          code: 'no_approved_revision',
          severity: 'error',
          message: 'No revision',
        },
      ],
    };
    expect(hashBrandedGenerationResolutionV1(blocked)).toMatch(
      /^sha256:[a-f0-9]{64}$/,
    );
    expect(
      hashBrandedGenerationResolutionV1({
        ...blocked,
        reasonCode: 'context_unavailable',
      }),
    ).not.toBe(hashBrandedGenerationResolutionV1(blocked));
  });
  it('artifact manifest preserves exact part ordering and requires actual textHash for text', () => {
    const parts = [
      { id: 'one', version: '1', contentHash: hash, role: 'primary' as const },
      { id: 'two', version: '1', contentHash: hash, role: 'text' as const },
    ];
    const v = { mediaKind: 'text' as const, textHash: hash, parts };
    expect(hashBrandedGenerationArtifactManifestV1(v)).not.toBe(
      hashBrandedGenerationArtifactManifestV1({
        ...v,
        parts: [...parts].reverse(),
      }),
    );
    expect(() =>
      hashBrandedGenerationArtifactManifestV1({ ...v, textHash: null }),
    ).toThrow();
    expect(() =>
      hashBrandedGenerationArtifactManifestV1({
        ...v,
        parts: [parts[0], parts[0]],
      }),
    ).toThrow();
    expect(() =>
      hashBrandedGenerationArtifactManifestV1({ ...v, textHash: 'raw' }),
    ).toThrow();
    expect(
      hashBrandedGenerationArtifactManifestV1({
        mediaKind: 'image',
        textHash: null,
        parts,
      }),
    ).toMatch(/^sha256:/);
  });
  it('rejects malformed textHash without coercing it', () => {
    let coercions = 0;
    const textHash = {
      toString() {
        coercions += 1;
        throw new Error('textHash must not be coerced');
      },
    };
    expect(() =>
      hashBrandedGenerationArtifactManifestV1({
        mediaKind: 'text',
        textHash: textHash as unknown as string,
        parts: [],
      }),
    ).toThrow(new TypeError('Invalid branded generation JSON'));
    expect(coercions).toBe(0);
  });
  it('report excludes id/clock/message but retains structural diagnostics, quality and checks', () => {
    const v = report();
    const changed = {
      ...v,
      id: 'other',
      checkedAt: '2027-01-01T00:00:00.000Z',
      diagnostics: [{ ...v.diagnostics[0], message: 'Changed prose' }],
    };
    expect(hashBrandArtifactValidationReportV1(changed)).toBe(
      hashBrandArtifactValidationReportV1(v),
    );
    expect(
      hashBrandArtifactValidationReportV1({
        ...v,
        diagnostics: [{ ...v.diagnostics[0], code: 'validation_failed' }],
      }),
    ).not.toBe(hashBrandArtifactValidationReportV1(v));
    expect(
      hashBrandArtifactValidationReportV1({
        ...v,
        checks: [{ ...v.checks[0], evidenceIds: ['actual'] }],
      }),
    ).not.toBe(hashBrandArtifactValidationReportV1(v));
  });
  it('operation rejects top-level keys while preserving nested command names', () => {
    const invalidBodies: readonly BrandedGenerationJsonV1[] = [
      { expectedRevision: 0 },
      { operationKey: 'key' },
    ];
    for (const body of invalidBodies)
      expect(() => hashBrandedGenerationOperationV1('resolve', body)).toThrow(
        'Invalid branded generation JSON',
      );
    expect(
      hashBrandedGenerationOperationV1('resolve', {
        nested: { expectedRevision: 0, operationKey: 'key' },
      }),
    ).toMatch(/^sha256:/);
    expect(hashBrandedGenerationOperationV1('resolve', {})).not.toBe(
      hashBrandedGenerationOperationV1('cancel', {}),
    );
  });
});
it('resolution retains immutable selected arm and explicit application state', () => {
  const v = resolution();
  v.learning.privateAccount.mode = 'unavailable';
  const original = hashBrandedGenerationResolutionV1(v);
  if (!v.learning.privateAccount.application)
    throw new Error('Missing application fixture');
  v.learning.privateAccount.application.status = 'suppressed';
  expect(hashBrandedGenerationResolutionV1(v)).not.toBe(original);
  v.learning.privateAccount.armId = ContentLearningArm.QUESTION_EXAMPLE;
  expect(hashBrandedGenerationResolutionV1(v)).not.toBe(
    hashBrandedGenerationResolutionV1({
      ...v,
      learning: {
        ...v.learning,
        privateAccount: { ...v.learning.privateAccount, armId: undefined },
      },
    }),
  );
});
it('report hashes actual quality/method/result changes without interpreting quality', () => {
  const v = report();
  const original = hashBrandArtifactValidationReportV1(v);
  expect(
    hashBrandArtifactValidationReportV1({
      ...v,
      quality: {
        score: 0.9,
        confidence: null,
        evaluatorId: 'quality',
        evaluatorVersion: 1,
        calibrationStatus: 'unverified',
      },
    }),
  ).not.toBe(original);
  expect(
    hashBrandArtifactValidationReportV1({
      ...v,
      checks: [{ ...v.checks[0], method: 'human_review' }],
    }),
  ).not.toBe(original);
  expect(
    hashBrandArtifactValidationReportV1({
      ...v,
      checks: [{ ...v.checks[0], result: 'fail' }],
    }),
  ).not.toBe(original);
});
it('identity preserves canonical rule list order and source values', () => {
  const v = snapshot();
  v.generationRules.evidence = [
    { id: 'one', sourceType: 'manual', label: 'First' },
    { id: 'two', sourceType: 'manual', label: 'Second' },
  ];
  const original = hashBrandIdentitySnapshotV1(v);
  expect(
    hashBrandIdentitySnapshotV1({
      ...v,
      generationRules: {
        ...v.generationRules,
        evidence: [...v.generationRules.evidence].reverse(),
      },
    }),
  ).not.toBe(original);
});

it('identity hashes explicit approved applicability and preserves list order and repeated resolution', () => {
  const v = snapshot();
  v.generationRules.evidence = [
    { id: 'evidence', sourceType: 'manual', label: 'Owner attestation' },
  ];
  v.generationRules.typography = [
    {
      id: 'font',
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
  const universal = hashBrandIdentitySnapshotV1(v);
  v.generationRules.typography[0].appliesToMediaKinds = ['image', 'video'];
  const scoped = hashBrandIdentitySnapshotV1(v);
  expect(scoped).not.toBe(universal);
  expect(
    hashBrandIdentitySnapshotV1({
      ...v,
      resolvedAt: '2027-01-01T00:00:00.000Z',
    }),
  ).toBe(scoped);
  v.generationRules.typography[0].appliesToMediaKinds = ['video', 'image'];
  expect(hashBrandIdentitySnapshotV1(v)).not.toBe(scoped);
});

function reviewRules(): BrandGenerationRulesV1 {
  return {
    schemaVersion: 1,
    evidence: [
      {
        id: 'evidence-a',
        sourceType: 'manual',
        label: 'Owner',
        excerpt: 'Exact source',
        contentHash: hash,
      },
      { id: 'evidence-b', sourceType: 'manual', label: 'Owner B' },
    ],
    facts: [
      {
        id: 'fact',
        kind: 'statement',
        subject: 'Product',
        predicate: 'name',
        value: 'Acme',
        required: true,
        match: 'literal',
        evidenceIds: ['evidence-a'],
      },
    ],
    palette: [
      {
        id: 'palette',
        color: '#112233',
        usage: 'Primary',
        required: true,
        evidenceIds: ['evidence-a'],
      },
    ],
    typography: [
      {
        id: 'typography',
        role: 'heading',
        family: 'Sans',
        weight: 400,
        style: 'normal',
        availability: 'verified_runtime',
        runtimeFontId: 'runtime-font',
        required: true,
        evidenceIds: ['evidence-a'],
      },
    ],
    mandatory: [
      {
        id: 'mandatory',
        text: 'Complete mandatory wording',
        match: 'literal',
        required: true,
        evidenceIds: ['evidence-a'],
      },
    ],
    avoid: [
      {
        id: 'avoid',
        text: 'Avoid this',
        match: 'literal',
        required: true,
        evidenceIds: ['evidence-a'],
      },
    ],
    examples: [
      {
        id: 'example',
        polarity: 'positive',
        text: 'Example wording',
        evidenceIds: ['evidence-a'],
      },
    ],
    approvedLiterals: [
      {
        id: 'literal:fact',
        kind: 'fact',
        factRuleId: 'fact',
        text: 'Acme',
        evidenceIds: ['evidence-a'],
      },
      {
        id: 'literal:copy',
        kind: 'approved_copy',
        text: ' Exact approved Café 😀\r\n ',
        evidenceIds: ['evidence-b'],
      },
    ],
    assets: [
      {
        id: 'asset',
        assetId: 'asset-record',
        role: 'logo',
        contentHash: hash,
        mimeType: 'image/png',
        required: true,
        evidenceIds: ['evidence-a'],
        textCoverage: {
          kind: 'approved_literals',
          literalIds: ['literal:fact', 'literal:copy'],
          evidenceIds: ['evidence-a', 'evidence-b'],
        },
      },
    ],
  };
}
function reviewedLiterals(
  rules: BrandGenerationRulesV1,
): NonNullable<BrandGenerationRulesV1['approvedLiterals']> {
  if (!rules.approvedLiterals)
    throw new Error('Missing reviewed wording fixture');
  return rules.approvedLiterals;
}
function reviewedCoverage(
  rules: BrandGenerationRulesV1,
): NonNullable<BrandGenerationRulesV1['assets'][number]['textCoverage']> {
  const coverage = rules.assets[0].textCoverage;
  if (!coverage) throw new Error('Missing asset inventory fixture');
  return coverage;
}
describe('whole owner-authored generation rules review domain', () => {
  it('hashes the complete validated catalogue under its distinct domain without changing snapshot hashing', () => {
    const rules = reviewRules();
    const encoded = canonicalizeBrandedGenerationJsonV1(
      rules as unknown as BrandedGenerationJsonV1,
    );
    expect(hashBrandGenerationRulesReviewV1(rules)).toBe(
      hashBrandedGenerationTextV1(
        `brand-generation-rules-review-v1\n${encoded}`,
      ),
    );
    expect(hashBrandGenerationRulesReviewV1(rules)).toBe(
      hashBrandedGenerationJsonV1(
        'brand-generation-rules-review-v1',
        rules as unknown as BrandedGenerationJsonV1,
      ),
    );
    expect(hashBrandGenerationRulesReviewV1(rules)).not.toBe(
      hashBrandedGenerationJsonV1(
        'brand-identity-v1',
        rules as unknown as BrandedGenerationJsonV1,
      ),
    );
    const identity = { ...snapshot(), generationRules: rules };
    const first = hashBrandIdentitySnapshotV1(identity);
    const changed = structuredClone(rules);
    reviewedLiterals(changed)[1].text += 'changed';
    expect(
      hashBrandIdentitySnapshotV1({ ...identity, generationRules: changed }),
    ).not.toBe(first);
    const coverage = structuredClone(rules);
    coverage.assets[0].textCoverage = {
      kind: 'none',
      literalIds: [],
      evidenceIds: ['evidence-a'],
    };
    expect(
      hashBrandIdentitySnapshotV1({ ...identity, generationRules: coverage }),
    ).not.toBe(first);
  });
  it('is field-order stable while preserving exact strings and every list order', () => {
    const rules = reviewRules();
    const reversedFields = Object.fromEntries(
      Object.entries(rules).reverse(),
    ) as unknown as BrandGenerationRulesV1;
    expect(hashBrandGenerationRulesReviewV1(reversedFields)).toBe(
      hashBrandGenerationRulesReviewV1(rules),
    );
    const nested = structuredClone(rules);
    nested.assets[0] = Object.fromEntries(
      Object.entries(nested.assets[0]).reverse(),
    ) as unknown as BrandGenerationRulesV1['assets'][number];
    expect(hashBrandGenerationRulesReviewV1(nested)).toBe(
      hashBrandGenerationRulesReviewV1(rules),
    );
    for (const field of ['evidence', 'approvedLiterals'] as const) {
      const changed = structuredClone(rules);
      const entries = changed[field];
      if (!entries) throw new Error('Missing ordered rule fixture');
      entries.reverse();
      expect(hashBrandGenerationRulesReviewV1(changed)).not.toBe(
        hashBrandGenerationRulesReviewV1(rules),
      );
    }
    const inventory = structuredClone(rules);
    reviewedCoverage(inventory).literalIds.reverse();
    expect(hashBrandGenerationRulesReviewV1(inventory)).not.toBe(
      hashBrandGenerationRulesReviewV1(rules),
    );
    const evidenceOrder = structuredClone(rules);
    reviewedCoverage(evidenceOrder).evidenceIds.reverse();
    expect(hashBrandGenerationRulesReviewV1(evidenceOrder)).not.toBe(
      hashBrandGenerationRulesReviewV1(rules),
    );
  });
  it.each([
    [
      'fact value',
      (rules: BrandGenerationRulesV1) => {
        rules.facts[0].value = 'New name';
      },
    ],
    [
      'fact requiredness',
      (rules: BrandGenerationRulesV1) => {
        rules.facts[0].required = false;
      },
    ],
    [
      'fact match',
      (rules: BrandGenerationRulesV1) => {
        rules.facts[0].match = 'semantic';
      },
    ],
    [
      'applicability',
      (rules: BrandGenerationRulesV1) => {
        rules.facts[0].appliesToMediaKinds = ['image'];
      },
    ],
    [
      'palette',
      (rules: BrandGenerationRulesV1) => {
        rules.palette[0].color = '#445566';
      },
    ],
    [
      'typography',
      (rules: BrandGenerationRulesV1) => {
        rules.typography[0].weight = 700;
      },
    ],
    [
      'mandatory',
      (rules: BrandGenerationRulesV1) => {
        rules.mandatory[0].text += ' changed';
      },
    ],
    [
      'avoid',
      (rules: BrandGenerationRulesV1) => {
        rules.avoid[0].text += ' changed';
      },
    ],
    [
      'example',
      (rules: BrandGenerationRulesV1) => {
        rules.examples[0].text += ' changed';
      },
    ],
    [
      'evidence content',
      (rules: BrandGenerationRulesV1) => {
        rules.evidence[0].excerpt += ' changed';
      },
    ],
    [
      'evidence hash',
      (rules: BrandGenerationRulesV1) => {
        rules.evidence[0].contentHash = `sha256:${'b'.repeat(64)}`;
      },
    ],
    [
      'literal text',
      (rules: BrandGenerationRulesV1) => {
        reviewedLiterals(rules)[1].text += ' changed';
      },
    ],
    [
      'literal evidence',
      (rules: BrandGenerationRulesV1) => {
        reviewedLiterals(rules)[1].evidenceIds = ['evidence-a'];
      },
    ],
    [
      'literal fact link',
      (rules: BrandGenerationRulesV1) => {
        rules.facts.push({ ...rules.facts[0], id: 'second-fact' });
        const literal = reviewedLiterals(rules)[0];
        if (literal.kind !== 'fact') throw new Error('Expected fact literal');
        literal.factRuleId = 'second-fact';
      },
    ],
    [
      'asset identity',
      (rules: BrandGenerationRulesV1) => {
        rules.assets[0].assetId = 'another-asset';
      },
    ],
    [
      'asset hash',
      (rules: BrandGenerationRulesV1) => {
        rules.assets[0].contentHash = `sha256:${'b'.repeat(64)}`;
      },
    ],
    [
      'asset MIME',
      (rules: BrandGenerationRulesV1) => {
        rules.assets[0].mimeType = 'image/jpeg';
      },
    ],
    [
      'asset inventory',
      (rules: BrandGenerationRulesV1) => {
        reviewedCoverage(rules).literalIds = ['literal:fact'];
      },
    ],
    [
      'asset review evidence',
      (rules: BrandGenerationRulesV1) => {
        reviewedCoverage(rules).evidenceIds = ['evidence-b'];
      },
    ],
  ] as const)(
    'changes digest for %s independently of the literal-only catalogue',
    (_name, change) => {
      const rules = reviewRules();
      const changed = structuredClone(rules);
      change(changed);
      expect(hashBrandGenerationRulesReviewV1(changed)).not.toBe(
        hashBrandGenerationRulesReviewV1(rules),
      );
      expect(rules).toEqual(reviewRules());
    },
  );
  it('omits only validated optional undefined and keeps absent legacy fields absent', () => {
    const rules = reviewRules();
    const changed = structuredClone(rules);
    changed.facts[0].qualifier = undefined;
    changed.evidence[0].sourceId = undefined;
    expect(hashBrandGenerationRulesReviewV1(changed)).toBe(
      hashBrandGenerationRulesReviewV1(rules),
    );
    const legacy = snapshot().generationRules;
    expect(
      hashBrandGenerationRulesReviewV1({
        ...legacy,
        approvedLiterals: undefined,
      }),
    ).toBe(hashBrandGenerationRulesReviewV1(legacy));
    expect(() =>
      hashBrandGenerationRulesReviewV1({
        ...legacy,
        unknown: undefined,
      } as unknown as BrandGenerationRulesV1),
    ).toThrow();
    const bad = {
      ...rules,
      facts: [undefined],
    } as unknown as BrandGenerationRulesV1;
    expect(() => hashBrandGenerationRulesReviewV1(bad)).toThrow();
  });
  it('rejects accessors and malformed strict data before invoking getters or coercion', () => {
    const getter = vi.fn(() => reviewRules().approvedLiterals);
    const coercion = vi.fn();
    const hostile = Object.defineProperty(reviewRules(), 'approvedLiterals', {
      enumerable: true,
      get: getter,
    });
    expect(() => hashBrandGenerationRulesReviewV1(hostile)).toThrow(
      'Invalid branded generation JSON',
    );
    expect(getter).not.toHaveBeenCalled();
    const nested = reviewRules();
    Object.defineProperty(nested.assets[0], 'textCoverage', {
      enumerable: true,
      get: getter,
    });
    expect(() => hashBrandGenerationRulesReviewV1(nested)).toThrow(
      'Invalid branded generation JSON',
    );
    expect(getter).not.toHaveBeenCalled();
    for (const malformed of [
      {
        ...reviewRules(),
        approvedLiterals: [
          {
            id: 'not-prefixed',
            kind: 'approved_copy',
            text: 'text',
            evidenceIds: ['evidence-a'],
          },
        ],
      },
      { ...reviewRules(), schemaVersion: 2 },
      { ...reviewRules(), unknown: 'value' },
      {
        ...reviewRules(),
        evidence: [
          {
            id: 'evidence-a',
            sourceType: 'manual',
            label: { toString: coercion },
          },
        ],
      },
    ])
      expect(() =>
        hashBrandGenerationRulesReviewV1(
          malformed as unknown as BrandGenerationRulesV1,
        ),
      ).toThrow();
    expect(coercion).not.toHaveBeenCalled();
  });
});
