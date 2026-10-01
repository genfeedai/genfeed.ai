import { fitRequiredBrandContextToBudgetWithReport } from '@api/services/agent-context-assembly/brand-context-budget.util';
import {
  hashBrandedGenerationOperationV1,
  hashBrandedGenerationTextV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import type { BrandedGenerationCompilerRecipeV1 } from '@api/services/branded-generation-receipts/branded-generation-recompile.types';
import {
  encodeBrandedGenerationCompilerRecipeV1,
  parseBrandedGenerationCompilerRecipeV1,
} from '@api/services/branded-generation-receipts/branded-generation-recompile-codec.util';
import {
  compileSnapshotBriefResolution,
  projectBrandSnapshotContributions,
  suppressSnapshotLearning,
} from '@api/services/harness/branded-generation-compiler';
import type {
  BrandedGenerationInputV1,
  BrandIdentitySnapshotV1,
  BrandLearningApplicationV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { LEARNING_ARMS, learningContribution } from '@genfeedai/harness';
import { describe, expect, it, vi } from 'vitest';

const MAX_BYTES = 2097152;
function baseline(): BrandLearningApplicationV1 {
  return {
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
        revalidatedAt: '2026-10-01T00:00:00.000Z',
      },
    },
  };
}
function empty(): BrandedGenerationCompilerRecipeV1 {
  return ['snapshot-brief-v1', [], [], [], baseline(), {}];
}
function stage(
  kind: 'skill' | 'knowledge' | 'harness_profile' | 'pack',
  id = kind,
): BrandedGenerationCompilerRecipeV1[1][number] {
  return [
    {
      kind,
      id,
      version: kind === 'pack' ? '  opaque-v1  ' : 1,
      status: 'not_applicable',
      evidenceIds: [],
      omittedIds: [],
    },
    [
      {
        header: '## Exact Café 😀\r\n',
        content: '  preserved\nbytes\r\n ',
        instructions: 'exact instructions',
        untrusted: true,
        isAtomic: true,
      },
    ],
    [['omission-b', 'omission-a']],
  ];
}
function failedSkill(): BrandedGenerationCompilerRecipeV1[1][number] {
  return [
    {
      kind: 'skill',
      status: 'unavailable',
      reasonCode: 'skill_unavailable',
      evidenceIds: [],
      omittedIds: [],
    },
    [],
    [],
  ];
}
function recipe(): BrandedGenerationCompilerRecipeV1 {
  return [
    'snapshot-brief-v1',
    [stage('skill'), stage('knowledge')],
    [stage('harness_profile'), stage('pack'), failedSkill(), failedSkill()],
    [
      {
        code: 'source_failed',
        severity: 'warning',
        message: 'Exact diagnostic',
        ruleId: 'rule',
        evidenceIds: ['b', 'a'],
      },
    ],
    baseline(),
    {},
  ];
}
function roundtrip(value: BrandedGenerationCompilerRecipeV1) {
  return parseBrandedGenerationCompilerRecipeV1(
    JSON.parse(encodeBrandedGenerationCompilerRecipeV1(value)),
  );
}
function recipeHash(value: BrandedGenerationCompilerRecipeV1) {
  return hashBrandedGenerationOperationV1('recompose', {
    compilerRecipe: JSON.parse(encodeBrandedGenerationCompilerRecipeV1(value)),
  });
}
function identity(): BrandIdentitySnapshotV1 {
  return {
    schemaVersion: 1,
    organizationId: 'org',
    brandId: 'brand',
    revisionId: 'revision',
    revisionVersion: 1,
    approval: 'approved',
    resolvedAt: '2026-10-01T00:00:00.000Z',
    contentHash: `sha256:${'a'.repeat(64)}`,
    identity: {
      name: 'Historical A',
      description: 'Description',
      positioning: 'Position',
      language: 'en',
    },
    voice: {
      tone: 'Direct',
      style: 'Plain',
      audience: ['Founders'],
      values: ['Clarity'],
      messagingPillars: ['Useful'],
      avoid: [],
      sample: 'Sample',
    },
    generationRules: {
      schemaVersion: 1,
      evidence: [],
      facts: [],
      mandatory: [],
      avoid: [],
      palette: [],
      typography: [],
      assets: [],
      examples: [],
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
    requestKey: 'request',
    candidateIndex: 0,
    surface: 'api',
    contentType: 'post',
    format: 'text',
    mode: 'approved_brand',
    originalPrompt: '  Request\r\nCafe\u0301 🎨  ',
    provider: 'fixture',
    model: 'fixture',
    generationParameters: {},
    knowledgeSourceIds: [],
    knowledgeSpaceIds: [],
  };
}
function compile(
  value: BrandedGenerationCompilerRecipeV1,
  request = input(),
  snapshot: BrandIdentitySnapshotV1 | null = identity(),
) {
  return compileSnapshotBriefResolution(
    request,
    snapshot,
    value[4],
    value[5],
    value[1],
    value[2],
    value[3],
  );
}

describe('lossless strict compiler recipe codec', () => {
  it('retains all stages, repeated idless failures, trust flags, versions, omission order and detached data', () => {
    const source = recipe();
    const parsed = parseBrandedGenerationCompilerRecipeV1(source);
    expect(parsed).toEqual(source);
    expect(roundtrip(source)).toEqual(source);
    expect(parsed).not.toBe(source);
    expect(parsed[1][0][1][0]).not.toBe(source[1][0][1][0]);
    const decoded = roundtrip(source);
    (source[1][0][1][0] as { content: string }).content = 'mutated';
    expect(decoded[1][0][1][0].content).toBe('  preserved\nbytes\r\n ');
    expect(parsed[2].slice(-2)).toEqual([failedSkill(), failedSkill()]);
  });
  it.each(LEARNING_ARMS)('preserves actual catalogue arm %s', (arm) => {
    const source = empty();
    const value: BrandedGenerationCompilerRecipeV1 = [
      ...source.slice(0, 5),
      learningContribution(arm),
    ] as unknown as BrandedGenerationCompilerRecipeV1;
    expect(roundtrip(value)).toEqual(value);
  });
  it('preserves all six missing-versus-empty contribution representations', () => {
    const value = empty();
    const fields = [
      'systemDirectives',
      'styleDirectives',
      'guardrails',
      'evaluationCriteria',
      'providerHints',
      'sources',
    ] as const;
    for (const field of fields) {
      const contribution = { [field]: [] };
      const candidate: BrandedGenerationCompilerRecipeV1 = [
        value[0],
        value[1],
        value[2],
        value[3],
        value[4],
        contribution,
      ];
      expect(roundtrip(candidate)[5]).toEqual(contribution);
    }
    expect(roundtrip(value)[5]).toEqual({});
  });
  it('permits only schema-optional object undefined during encoding', () => {
    const source = recipe();
    const layer = { ...source[1][0][0], contentHash: undefined };
    const section = { ...source[1][0][1][0], instructions: undefined };
    const learning = {
      ...source[4],
      privateAccount: { ...source[4].privateAccount, decisionId: undefined },
    };
    const value = [
      source[0],
      [[layer, [section], source[1][0][2]]],
      source[2],
      [{ ...source[3][0], ruleId: undefined }],
      learning,
      { styleDirectives: undefined },
    ] as unknown as BrandedGenerationCompilerRecipeV1;
    const decoded = roundtrip(value);
    expect(decoded[1][0][0]).not.toHaveProperty('contentHash');
    expect(decoded[1][0][1][0]).not.toHaveProperty('instructions');
    expect(decoded[4].privateAccount).not.toHaveProperty('decisionId');
    expect(decoded[3][0]).not.toHaveProperty('ruleId');
    expect(decoded[5]).toEqual({});
    expect(() => parseBrandedGenerationCompilerRecipeV1(value)).toThrow(
      'compiler_recipe_invalid',
    );
    for (const invalid of [
      [...empty().slice(0, 5), { unknown: undefined }],
      ['snapshot-brief-v1', [undefined], [], [], baseline(), {}],
      [
        'snapshot-brief-v1',
        [],
        [],
        [],
        { ...baseline(), schemaVersion: undefined },
        {},
      ],
    ])
      expect(() =>
        encodeBrandedGenerationCompilerRecipeV1(
          invalid as unknown as BrandedGenerationCompilerRecipeV1,
        ),
      ).toThrow('compiler_recipe_invalid');
  });
  it.each(
    [
      ['snapshot-brief-v2', [], [], [], baseline(), {}],
      ['snapshot-brief-v1', [stage('pack')], [], [], baseline(), {}],
      [
        'snapshot-brief-v1',
        [stage('skill'), stage('skill')],
        [],
        [],
        baseline(),
        {},
      ],
      [
        'snapshot-brief-v1',
        [],
        [],
        [],
        baseline(),
        { styleDirectives: ['arbitrary tactic'] },
      ],
      [
        'snapshot-brief-v1',
        [],
        [],
        [],
        baseline(),
        { sources: [{ id: 'source' }] },
      ],
      ['snapshot-brief-v1', [], [], [], baseline(), { unexpected: [] }],
    ].map((value) => ({ value })),
  )('rejects strict shape, identity and catalogue mismatch', ({ value }) => {
    expect(() => parseBrandedGenerationCompilerRecipeV1(value)).toThrow(
      'compiler_recipe_invalid',
    );
  });
  it('rejects invalid stage state, content identity and omission rows', () => {
    const original = stage('skill');
    const bad = [
      [{ ...original[0], status: 'applied' }, original[1], original[2]],
      [
        { ...original[0], status: 'unavailable', reasonCode: 'unavailable' },
        original[1],
        original[2],
      ],
      [{ ...original[0], id: undefined }, original[1], original[2]],
      [original[0], original[1], []],
      [original[0], original[1], [['duplicate', 'duplicate']]],
    ];
    for (const candidate of bad)
      expect(() =>
        encodeBrandedGenerationCompilerRecipeV1([
          'snapshot-brief-v1',
          [candidate],
          [],
          [],
          baseline(),
          {},
        ] as unknown as BrandedGenerationCompilerRecipeV1),
      ).toThrow('compiler_recipe_invalid');
  });
  it('matches the actual eight-argument compiler resolution and raw path exactly after persistence', () => {
    const base = recipe();
    const source: BrandedGenerationCompilerRecipeV1 = [
      base[0],
      base[1].map(([layer, sections, rows]) => [
        layer,
        sections.map((section) => ({ ...section, untrusted: false })),
        rows,
      ]),
      base[2],
      base[3],
      base[4],
      base[5],
    ];
    const retained = roundtrip(source);
    expect(compile(retained)).toEqual(compile(source));
    expect(compile(retained).status).toBe('resolved');
    expect(
      compile(retained).layers.find((layer) => layer.kind === 'pack')?.version,
    ).toBe('  opaque-v1  ');
    const raw = { ...input(), mode: 'raw' as const };
    expect(compile(roundtrip(empty()), raw, null)).toEqual(
      compile(empty(), raw, null),
    );
  });
  it('preserves optional sections omitted by the actual compiler and changes hashes for hidden retained data', () => {
    const source = empty();
    const optional = stage('pack');
    const candidate: BrandedGenerationCompilerRecipeV1 = [
      source[0],
      [],
      [
        [
          optional[0],
          [{ ...optional[1][0], content: 'x'.repeat(6500) }],
          optional[2],
        ],
      ],
      [],
      source[4],
      {},
    ];
    const retained = roundtrip(candidate);
    const resolved = compile(retained);
    expect(resolved.status).toBe('resolved');
    expect(resolved.layers.find((layer) => layer.kind === 'pack')?.status).toBe(
      'skipped',
    );
    expect(retained[2][0][1][0].content).toHaveLength(6500);
    for (const change of [
      [
        optional[0],
        [{ ...optional[1][0], content: 'y'.repeat(6500) }],
        optional[2],
      ],
      [optional[0], retained[2][0][1], [['different-omission']]],
      [
        { ...optional[0], version: 'different-version' },
        retained[2][0][1],
        optional[2],
      ],
    ])
      expect(
        recipeHash([
          source[0],
          [],
          [change],
          [],
          source[4],
          {},
        ] as unknown as BrandedGenerationCompilerRecipeV1),
      ).not.toBe(recipeHash(candidate));
  });
  it('preserves actual overflow-to-blocked behavior instead of manufacturing success', () => {
    const request = { ...input(), originalPrompt: 'x'.repeat(65500) };
    const result = compile(roundtrip(empty()), request);
    expect(result).toMatchObject({
      status: 'blocked',
      reasonCode: 'context_budget_exceeded',
    });
    expect(result).toEqual(compile(empty(), request));
  });
  it('keeps operation hashes stable across key insertion order and optional undefined projection', () => {
    const source = recipe();
    const layer = source[1][0][0];
    const reordered = {
      omittedIds: layer.omittedIds,
      evidenceIds: layer.evidenceIds,
      status: layer.status,
      version: layer.version,
      id: layer.id,
      kind: layer.kind,
      contentHash: undefined,
    };
    const changed: BrandedGenerationCompilerRecipeV1 = [
      source[0],
      [[reordered, source[1][0][1], source[1][0][2]], source[1][1]],
      source[2],
      source[3],
      source[4],
      source[5],
    ];
    expect(recipeHash(changed)).toBe(recipeHash(source));
  });
});

function appliedLearning(): BrandLearningApplicationV1 {
  return {
    ...baseline(),
    global: {
      status: 'applied',
      releaseId: 'release',
      releaseRevision: 2,
      policyId: 'policy',
      policyVersion: 3,
      descriptorHash: 'a'.repeat(64),
      contributionHash: `sha256:${'a'.repeat(64)}`,
      brandPreferenceRevision: 0,
      stage: 'stable',
      scope: { platform: 'instagram', format: 'text', objective: 'engagement' },
      revalidatedAt: '2026-10-01T00:00:00.000Z',
    },
  };
}
function compatibleIdentity(): BrandIdentitySnapshotV1 {
  const value = identity();
  value.generationRules.evidence = [
    { id: 'evidence', sourceType: 'manual', label: 'Owner' },
  ];
  value.generationRules.facts = [
    {
      id: 'fact',
      kind: 'statement',
      subject: 'Product',
      predicate: 'name',
      value: 'Acme',
      evidenceIds: ['evidence'],
      required: true,
      match: 'literal',
    },
  ];
  value.generationRules.examples = [
    {
      id: 'example',
      polarity: 'positive',
      text: 'Example',
      evidenceIds: ['evidence'],
    },
  ];
  return value;
}
describe('actual learning recomposition provenance', () => {
  it('removes actually applied learning using the canonical suppression helper while keeping the small pack', () => {
    const source: BrandedGenerationCompilerRecipeV1 = [
      'snapshot-brief-v1',
      [],
      [stage('pack')],
      [],
      appliedLearning(),
      learningContribution(LEARNING_ARMS[1]),
    ];
    const before = structuredClone(source);
    const snapshot = compatibleIdentity();
    const request = input();
    const original = compile(source, request, snapshot);
    expect(original.status).toBe('resolved');
    expect(
      original.layers.find((layer) => layer.kind === 'global_release')?.status,
    ).toBe('applied');
    expect(original.layers.find((layer) => layer.kind === 'pack')?.status).toBe(
      'applied',
    );
    const decoded = roundtrip(source);
    const suppressed = suppressSnapshotLearning(
      decoded[4],
      'learning_not_previously_applied',
      false,
    );
    const recomposed: BrandedGenerationCompilerRecipeV1 = [
      decoded[0],
      decoded[1],
      decoded[2],
      decoded[3],
      suppressed,
      {},
    ];
    const expected: BrandedGenerationCompilerRecipeV1 = [
      source[0],
      source[1],
      source[2],
      source[3],
      suppressSnapshotLearning(
        source[4],
        'learning_not_previously_applied',
        false,
      ),
      {},
    ];
    const result = compile(recomposed, request, snapshot);
    expect(result).toEqual(compile(expected, request, snapshot));
    expect(result.status).toBe('resolved');
    expect(
      result.layers.some(
        (layer) =>
          layer.kind === 'global_release' && layer.status === 'applied',
      ),
    ).toBe(false);
    expect(result.layers.find((layer) => layer.kind === 'pack')?.status).toBe(
      'applied',
    );
    if (result.status !== 'resolved') throw new Error('Expected recomposition');
    for (const directive of source[5].styleDirectives ?? [])
      expect(result.compiledPrompt).not.toContain(directive);
    expect(result.snapshot).toEqual(snapshot);
    expect(result.originalPromptHash).toBe(
      hashBrandedGenerationTextV1(request.originalPrompt),
    );
    expect(source).toEqual(before);
    expect(decoded).toEqual(before);
  });
  it('replays actual budget suppression without treating retained initial learning as promotion authority', () => {
    const snapshot = compatibleIdentity();
    const [required] = projectBrandSnapshotContributions(snapshot);
    const length = fitRequiredBrandContextToBudgetWithReport(required, []).text
      .length;
    snapshot.generationRules.facts[0].value = `Acme${'x'.repeat(6000 - length)}`;
    const source: BrandedGenerationCompilerRecipeV1 = [
      'snapshot-brief-v1',
      [],
      [],
      [],
      appliedLearning(),
      learningContribution(LEARNING_ARMS[1]),
    ];
    const original = compile(source, input(), snapshot);
    const decoded = roundtrip(source);
    expect(original.status).toBe('resolved');
    expect(
      original.layers.find((layer) => layer.kind === 'global_release')?.status,
    ).toBe('skipped');
    expect(original.learning.global.status).toBe('skipped');
    expect(compile(decoded, input(), snapshot)).toEqual(original);
    expect(decoded[4].global.status).toBe('applied');
    const suppressed: BrandedGenerationCompilerRecipeV1 = [
      decoded[0],
      decoded[1],
      decoded[2],
      decoded[3],
      suppressSnapshotLearning(
        decoded[4],
        'learning_not_previously_applied',
        false,
      ),
      {},
    ];
    expect(
      compile(suppressed, input(), snapshot).layers.some(
        (layer) =>
          layer.kind === 'global_release' && layer.status === 'applied',
      ),
    ).toBe(false);
  });
});
describe('codec resource and descriptor boundaries', () => {
  it('accepts exact stage, section and diagnostic counts and rejects each +1', () => {
    const base = empty();
    const diagnostic = {
      code: 'bounded',
      severity: 'info' as const,
      message: 'bounded',
    };
    const stages: BrandedGenerationCompilerRecipeV1 = [
      base[0],
      [],
      Array.from({ length: 256 }, failedSkill),
      [],
      base[4],
      {},
    ];
    expect(roundtrip(stages)[2]).toHaveLength(256);
    expect(() =>
      parseBrandedGenerationCompilerRecipeV1([
        base[0],
        [failedSkill()],
        stages[2],
        [],
        base[4],
        {},
      ]),
    ).toThrow('compiler_recipe_limit');
    const item = stage('pack');
    const sections = Array.from({ length: 256 }, () => ({ ...item[1][0] }));
    const rows = sections.map(() => []);
    const exact: BrandedGenerationCompilerRecipeV1 = [
      base[0],
      [],
      [[item[0], sections, rows]],
      Array.from({ length: 128 }, () => ({ ...diagnostic })),
      base[4],
      {},
    ];
    expect(roundtrip(exact)[2][0][1]).toHaveLength(256);
    expect(() =>
      parseBrandedGenerationCompilerRecipeV1([
        base[0],
        [],
        [[item[0], [...sections, sections[0]], [...rows, []]]],
        [],
        base[4],
        {},
      ]),
    ).toThrow('compiler_recipe_limit');
    expect(() =>
      parseBrandedGenerationCompilerRecipeV1([
        base[0],
        [],
        [],
        Array.from({ length: 129 }, () => diagnostic),
        base[4],
        {},
      ]),
    ).toThrow('compiler_recipe_limit');
  });
  it('accepts exact field lengths and omission ID count, rejects each +1 without truncation', () => {
    const base = empty();
    const item = stage('pack');
    const section = {
      ...item[1][0],
      header: 'h'.repeat(512),
      content: 'é'.repeat(32768),
      instructions: '\0'.repeat(65536),
    };
    const ids = Array.from({ length: 256 }, (_, index) => `id-${index}`);
    const candidate: BrandedGenerationCompilerRecipeV1 = [
      base[0],
      [],
      [[item[0], [section], [ids]]],
      [],
      base[4],
      {},
    ];
    expect(roundtrip(candidate)).toEqual(candidate);
    for (const patch of [
      { header: 'h'.repeat(513) },
      { content: `${'é'.repeat(32768)}a` },
      { instructions: '\0'.repeat(65537) },
    ])
      expect(() =>
        parseBrandedGenerationCompilerRecipeV1([
          base[0],
          [],
          [[item[0], [{ ...section, ...patch }], [ids]]],
          [],
          base[4],
          {},
        ]),
      ).toThrow('compiler_recipe_limit');
    expect(() =>
      parseBrandedGenerationCompilerRecipeV1([
        base[0],
        [],
        [[item[0], [section], [[...ids, 'extra']]]],
        [],
        base[4],
        {},
      ]),
    ).toThrow('compiler_recipe_limit');
  });
  it('accepts exact encoded-byte ceiling and stops at +1', () => {
    const base = empty();
    const item = stage('pack');
    const sections = Array.from({ length: 32 }, () => ({
      header: '',
      content: '',
      untrusted: false,
      isAtomic: true as const,
    }));
    const candidate: BrandedGenerationCompilerRecipeV1 = [
      base[0],
      [],
      [[item[0], sections, sections.map(() => [])]],
      [],
      base[4],
      {},
    ];
    let remaining =
      MAX_BYTES -
      Buffer.byteLength(encodeBrandedGenerationCompilerRecipeV1(candidate));
    for (const section of sections) {
      const size = Math.min(65536, remaining);
      section.content = 'x'.repeat(size);
      remaining -= size;
    }
    expect(remaining).toBe(0);
    expect(
      Buffer.byteLength(encodeBrandedGenerationCompilerRecipeV1(candidate)),
    ).toBe(MAX_BYTES);
    expect(roundtrip(candidate)).toEqual(candidate);
    sections[31].content += 'x';
    expect(() => encodeBrandedGenerationCompilerRecipeV1(candidate)).toThrow(
      'compiler_recipe_limit',
    );
  });
  it('counts exact depth and nodes before strict shape validation, and rejects oversized arrays early', () => {
    const nested = (depth: number): unknown => {
      let value: unknown = null;
      for (let index = 0; index < depth; index += 1) value = [value];
      return value;
    };
    expect(() => parseBrandedGenerationCompilerRecipeV1(nested(16))).toThrow(
      'compiler_recipe_invalid',
    );
    expect(() => parseBrandedGenerationCompilerRecipeV1(nested(17))).toThrow(
      'compiler_recipe_limit',
    );
    const nodes = [
      Array(65535).fill(null),
      Array(65535).fill(null),
      Array(65535).fill(null),
      Array(65534).fill(null),
    ];
    expect(() => parseBrandedGenerationCompilerRecipeV1(nodes)).toThrow(
      'compiler_recipe_invalid',
    );
    nodes[3].push(null);
    expect(() => parseBrandedGenerationCompilerRecipeV1(nodes)).toThrow(
      'compiler_recipe_limit',
    );
    const getter = vi.fn();
    const array = Array(65537);
    Object.defineProperty(array, '0', { enumerable: true, get: getter });
    expect(() => parseBrandedGenerationCompilerRecipeV1(array)).toThrow(
      'compiler_recipe_limit',
    );
    expect(getter).not.toHaveBeenCalled();
    expect(() =>
      parseBrandedGenerationCompilerRecipeV1('x'.repeat(MAX_BYTES + 1)),
    ).toThrow('compiler_recipe_limit');
  });
  it('allows shared acyclic and null-prototype values but refuses hostile descriptors without execution', () => {
    const source = empty();
    const shared = failedSkill();
    const candidate: BrandedGenerationCompilerRecipeV1 = [
      source[0],
      [],
      [shared, shared],
      [],
      source[4],
      {},
    ];
    expect(roundtrip(candidate)).toEqual(candidate);
    const contribution = Object.create(null);
    expect(
      parseBrandedGenerationCompilerRecipeV1([
        source[0],
        [],
        [],
        [],
        source[4],
        contribution,
      ])[5],
    ).toEqual({});
    const getter = vi.fn();
    const toJSON = vi.fn();
    const coercion = vi.fn();
    const accessor = Object.defineProperty({}, 'styleDirectives', {
      enumerable: true,
      get: getter,
    });
    const hidden = Object.defineProperty({}, 'styleDirectives', {
      enumerable: false,
      value: [],
    });
    const symbol = { [Symbol('hidden')]: [] };
    const cycle: unknown[] = [];
    cycle.push(cycle);
    const sparse = Array(1);
    const custom = Object.assign([], { extra: true });
    const unusual = Object.setPrototypeOf([], null);
    for (const value of [
      accessor,
      hidden,
      symbol,
      { toJSON },
      { toString: coercion },
      new Date(),
      Object.create({ inherited: true }),
      Object.defineProperty({}, '__proto__', { enumerable: true, value: {} }),
      { constructor: {} },
      { prototype: {} },
      cycle,
      sparse,
      custom,
      unusual,
      NaN,
      Infinity,
      1n,
      () => undefined,
    ])
      expect(() =>
        parseBrandedGenerationCompilerRecipeV1([
          source[0],
          [],
          [],
          [],
          source[4],
          value,
        ]),
      ).toThrow('compiler_recipe_invalid');
    expect(getter).not.toHaveBeenCalled();
    expect(toJSON).not.toHaveBeenCalled();
    expect(coercion).not.toHaveBeenCalled();
    const safe = recipe();
    const object = safe[1][0][1][0];
    Object.defineProperty(object, 'content', { enumerable: true, get: getter });
    expect(() => parseBrandedGenerationCompilerRecipeV1(safe)).toThrow(
      'compiler_recipe_invalid',
    );
    expect(getter).not.toHaveBeenCalled();
  });
});
