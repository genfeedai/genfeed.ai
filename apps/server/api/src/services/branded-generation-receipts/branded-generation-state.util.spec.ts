import {
  type BrandedGenerationOperationKindV1,
  type BrandedGenerationStateV1,
  canTransitionBrandedGenerationStateV1,
  classifyBrandedGenerationReadinessV1,
} from '@api/services/branded-generation-receipts/branded-generation-state.util';
import type {
  BrandArtifactValidationReportV1,
  BrandedGenerationReceiptV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

const hash = `sha256:${'a'.repeat(64)}`;
const time = '2026-10-01T00:00:00.000Z';
function receipt(): BrandedGenerationReceiptV1 {
  return {
    schemaVersion: 1,
    id: 'receipt',
    organizationId: 'org',
    brandId: 'brand',
    actorId: 'user',
    requestKey: 'request',
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
      id: 'artifact',
      version: '1',
      contentHash: hash,
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
        result: 'pass',
        method: 'exact_text',
        evidenceIds: ['actual-text'],
      },
    ],
    quality: null,
    diagnostics: [],
  };
}
describe('frozen lifecycle whitelist', () => {
  const states: BrandedGenerationStateV1[] = [
    'created',
    'resolved',
    'dispatched',
    'checking',
    'ready',
    'needs_review',
    'blocked',
    'failed',
    'cancelled',
  ];
  const operations: BrandedGenerationOperationKindV1[] = [
    'resolve',
    'recompose',
    'dispatch',
    'bind_artifact',
    'validate',
    'revalidate',
    'fail',
    'block',
    'cancel',
    'record_costs',
    'delete',
  ];
  it('matches the complete prepared whitelist and rejects all remaining pairs', () => {
    const expected = new Set<string>();
    function add(op: string, from: string[], to: string[]) {
      for (const a of from) for (const b of to) expected.add(`${op}:${a}:${b}`);
    }
    add('resolve', ['created'], ['resolved', 'blocked']);
    add('recompose', ['resolved'], ['resolved']);
    add('dispatch', ['resolved'], ['dispatched']);
    add('bind_artifact', ['dispatched'], ['checking']);
    add('validate', ['checking'], ['ready', 'needs_review', 'blocked']);
    add(
      'revalidate',
      ['checking', 'ready', 'needs_review', 'blocked'],
      ['ready', 'needs_review', 'blocked'],
    );
    add('fail', ['dispatched'], ['failed']);
    add(
      'block',
      ['created', 'resolved', 'dispatched', 'checking'],
      ['blocked'],
    );
    add('cancel', ['created', 'resolved'], ['cancelled']);
    for (const state of states) {
      add('record_costs', [state], [state]);
      add('delete', [state], [state]);
    }
    for (const operation of operations)
      for (const from of states)
        for (const to of states)
          expect(
            canTransitionBrandedGenerationStateV1(from, to, operation),
          ).toBe(expected.has(`${operation}:${from}:${to}`));
  });
  it('never dispatches twice or retries failed/indeterminate work', () => {
    for (const from of [
      'dispatched',
      'blocked',
      'failed',
      'cancelled',
    ] as const)
      expect(
        canTransitionBrandedGenerationStateV1(from, 'dispatched', 'dispatch'),
      ).toBe(false);
  });
  it('rejects unknown runtime states/commands', () => {
    expect(
      canTransitionBrandedGenerationStateV1(
        'unknown' as BrandedGenerationStateV1,
        'ready',
        'validate',
      ),
    ).toBe(false);
    expect(
      canTransitionBrandedGenerationStateV1(
        'checking',
        'unknown' as BrandedGenerationStateV1,
        'validate',
      ),
    ).toBe(false);
    expect(
      canTransitionBrandedGenerationStateV1(
        'checking',
        'ready',
        'unknown' as BrandedGenerationOperationKindV1,
      ),
    ).toBe(false);
  });
});
describe('schema-delegating actual report classification', () => {
  it('classifies approved complete report ready/passed without mutating costs or prompts', () => {
    const v = receipt();
    const before = structuredClone(v);
    const evidence = report();
    const reportBefore = structuredClone(evidence);
    expect(
      classifyBrandedGenerationReadinessV1({
        receipt: v,
        validation: evidence,
      }),
    ).toEqual({ state: 'ready', compliance: 'passed' });
    expect(v).toEqual(before);
    expect(evidence).toEqual(reportBefore);
    expect(v.costs[0]).not.toHaveProperty('credits');
    expect(v.prompts.enhanced).toBeNull();
  });
  it('raw completed artifact with no report is ready/not_claimed', () => {
    const v = receipt();
    v.mode = 'raw';
    v.snapshot = null;
    v.compliance = 'not_claimed';
    v.prompts.original = {
      contentHash: hash,
      retention: 'unavailable',
      reasonCode: 'prompt_snapshot_unavailable',
    };
    v.prompts.compiled = { ...v.prompts.original };
    expect(
      classifyBrandedGenerationReadinessV1({ receipt: v, validation: null }),
    ).toEqual({ state: 'ready', compliance: 'not_claimed' });
    expect(() =>
      classifyBrandedGenerationReadinessV1({
        receipt: v,
        validation: report(),
      }),
    ).toThrow('Invalid branded generation readiness input');
  });
  it('provisional complete report remains owner review', () => {
    const v = receipt();
    v.mode = 'provisional_brand';
    if (!v.snapshot) throw new Error('Missing fixture snapshot');
    v.snapshot.approval = 'provisional';
    expect(
      classifyBrandedGenerationReadinessV1({
        receipt: v,
        validation: report(),
      }),
    ).toEqual({ state: 'needs_review', compliance: 'unverified' });
  });
  it('no report or missing required checks remains unverified review', () => {
    expect(
      classifyBrandedGenerationReadinessV1({
        receipt: receipt(),
        validation: null,
      }),
    ).toEqual({ state: 'needs_review', compliance: 'unverified' });
    expect(
      classifyBrandedGenerationReadinessV1({
        receipt: receipt(),
        validation: { ...report(), checks: [] },
      }),
    ).toEqual({ state: 'needs_review', compliance: 'unverified' });
  });
  it.each(['unknown', 'unsupported', 'not_applicable'] as const)(
    'required %s cannot be rescued by quality',
    (result) => {
      const v = report();
      v.checks[0] = {
        ...v.checks[0],
        result,
        reasonCode: 'validation_unavailable',
      };
      v.quality = {
        score: 1,
        confidence: 1,
        evaluatorId: 'evaluator',
        evaluatorVersion: 1,
        calibrationStatus: 'verified',
      };
      expect(
        classifyBrandedGenerationReadinessV1({
          receipt: receipt(),
          validation: v,
        }),
      ).toEqual({ state: 'needs_review', compliance: 'unverified' });
    },
  );
  it('any real hard failure is blocked/failed', () => {
    const v = report();
    v.checks.push({
      ruleId: 'extra',
      category: 'fact',
      severity: 'hard',
      result: 'fail',
      method: 'capability',
      evidenceIds: [],
      reasonCode: 'validation_failed',
    });
    expect(
      classifyBrandedGenerationReadinessV1({
        receipt: receipt(),
        validation: v,
      }),
    ).toEqual({ state: 'blocked', compliance: 'failed' });
  });
  it('wrong typography-as-fact is rejected by the canonical schema rather than softened', () => {
    const v = receipt();
    if (!v.snapshot) throw new Error('Missing snapshot');
    v.snapshot.generationRules.typography = [
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
    const evidence = report();
    evidence.checks.push({
      ruleId: 'font',
      category: 'fact',
      severity: 'hard',
      result: 'pass',
      method: 'exact_text',
      evidenceIds: ['text'],
    });
    expect(() =>
      classifyBrandedGenerationReadinessV1({
        receipt: v,
        validation: evidence,
      }),
    ).toThrow(ZodError);
    evidence.checks[1] = {
      ...evidence.checks[1],
      result: 'fail',
      reasonCode: 'validation_failed',
    };
    expect(() =>
      classifyBrandedGenerationReadinessV1({
        receipt: v,
        validation: evidence,
      }),
    ).toThrow(ZodError);
  });
  it('duplicate canonical rule source is an invalid current receipt', () => {
    const v = receipt();
    if (!v.snapshot) throw new Error('Missing snapshot');
    v.snapshot.generationRules.avoid = [
      {
        id: 'fact',
        text: 'avoid',
        match: 'literal',
        required: true,
        evidenceIds: ['evidence'],
      },
    ];
    expect(() =>
      classifyBrandedGenerationReadinessV1({
        receipt: v,
        validation: report(),
      }),
    ).toThrow('Invalid branded generation readiness input');
  });
  it.each([
    'artifactHash',
    'snapshotHash',
    'artifactId',
    'artifactVersion',
  ] as const)('rejects incoming changed %s binding', (key) => {
    const v = report();
    v[key] = key.endsWith('Hash') ? `sha256:${'b'.repeat(64)}` : 'changed';
    expect(() =>
      classifyBrandedGenerationReadinessV1({
        receipt: receipt(),
        validation: v,
      }),
    ).toThrow(ZodError);
  });
  it('rejects deleted/incomplete/nonchecking current receipts', () => {
    for (const patch of [
      { isDeleted: true },
      { artifact: null },
      { execution: null },
      { execution: { ...receipt().execution, result: 'pending' } },
      { state: 'created' },
    ])
      expect(() =>
        classifyBrandedGenerationReadinessV1({
          receipt: { ...receipt(), ...patch } as BrandedGenerationReceiptV1,
          validation: report(),
        }),
      ).toThrow('Invalid branded generation readiness input');
  });
  it('never fabricates strict retained prompts', () => {
    const v = receipt();
    v.prompts.compiled = { contentHash: hash, retention: 'pending' };
    expect(() =>
      classifyBrandedGenerationReadinessV1({
        receipt: v,
        validation: report(),
      }),
    ).toThrow('Invalid branded generation readiness input');
  });
});

describe('canonical owner media scope classification', () => {
  it('delegates explicit exclusions without exempting universal fonts or synthetic hard checks', () => {
    const v = receipt();
    if (!v.snapshot) throw new Error('Missing fixture snapshot');
    v.snapshot.generationRules.typography = [
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
    const evidence = report();
    expect(
      classifyBrandedGenerationReadinessV1({
        receipt: v,
        validation: evidence,
      }),
    ).toEqual({ state: 'needs_review', compliance: 'unverified' });
    v.snapshot.generationRules.typography[0].appliesToMediaKinds = [
      'image',
      'video',
    ];
    expect(
      classifyBrandedGenerationReadinessV1({
        receipt: v,
        validation: evidence,
      }),
    ).toEqual({ state: 'ready', compliance: 'passed' });
    evidence.checks.push({
      ruleId: 'font',
      category: 'typography',
      severity: 'hard',
      result: 'not_applicable',
      method: 'capability',
      reasonCode: 'rule_media_not_applicable',
      evidenceIds: [],
    });
    expect(
      classifyBrandedGenerationReadinessV1({
        receipt: v,
        validation: evidence,
      }),
    ).toEqual({ state: 'ready', compliance: 'passed' });
    evidence.checks.push({
      ruleId: 'system:factual_coverage',
      category: 'fact',
      severity: 'hard',
      result: 'unknown',
      method: 'capability',
      reasonCode: 'factual_coverage_unknown',
      evidenceIds: [],
    });
    expect(
      classifyBrandedGenerationReadinessV1({
        receipt: v,
        validation: evidence,
      }),
    ).toEqual({ state: 'needs_review', compliance: 'unverified' });
    evidence.checks[2].result = 'fail';
    expect(
      classifyBrandedGenerationReadinessV1({
        receipt: v,
        validation: evidence,
      }),
    ).toEqual({ state: 'blocked', compliance: 'failed' });
  });
});
