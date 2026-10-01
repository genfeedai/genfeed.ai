import { ContentLearningArm } from '@genfeedai/contracts/enums';
import type {
  BrandArtifactValidationReportV1,
  BrandedGenerationInputV1,
  BrandedGenerationResolutionV1,
  BrandIdentitySnapshotV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { describe, expect, it } from 'vitest';
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
  hashBrandIdentitySnapshotV1,
} from './branded-generation-hash.util';
import type { BrandedGenerationOperationKindV1 } from './branded-generation-state.util';

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
