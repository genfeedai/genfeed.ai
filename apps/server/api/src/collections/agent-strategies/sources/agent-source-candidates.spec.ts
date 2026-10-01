import {
  type AgentSourceCandidate,
  agentSourceKey,
  rankEligibleAgentSources,
  validateAgentSourceSelection,
} from '@api/collections/agent-strategies/sources/agent-source-candidates';
import { resolveAgentSourcePolicy } from '@api/collections/agent-strategies/sources/agent-source-policy';
import { describe, expect, it } from 'vitest';

const scope = { organizationId: 'orgA', brandId: 'brandA' };
const now = '2026-10-01T12:00:00Z';
const policy = resolveAgentSourcePolicy(undefined, 7 * 24 * 60 * 60 * 1000);
function source(
  sourceId = 'I1',
  extra: Partial<AgentSourceCandidate> = {},
): AgentSourceCandidate {
  return {
    scope: { ...scope },
    sourceKind: 'source_post',
    sourceId,
    selector: { kind: 'source_post', sourcePostId: sourceId },
    observedAt: '2026-10-01T11:00:00Z',
    usageAllowed: true,
    isDeleted: false,
    ...extra,
  };
}
function rank(
  candidates: readonly AgentSourceCandidate[],
  blockedSourceKeys: ReadonlySet<string> = new Set(),
) {
  return rankEligibleAgentSources({
    scope,
    policy,
    now,
    candidates,
    blockedSourceKeys,
  });
}
function select(
  candidates: readonly AgentSourceCandidate[],
  selectedKeys: readonly string[],
) {
  return validateAgentSourceSelection({
    scope,
    strategyId: 'strategy',
    executionId: 'execution',
    policy,
    candidates,
    selectedKeys,
  });
}
describe('Agent source candidates', () => {
  it('filters foreign, deleted, old and disclosure-only records in the canonical scenario', () => {
    const saved = source('S1', {
      sourceKind: 'saved_ad',
      selector: { kind: 'saved_ad', savedAdId: 'S1' },
      observedAt: '2026-10-01T10:00:00Z',
    });
    const disclosure = source('S2', {
      sourceKind: 'saved_ad',
      selector: { kind: 'saved_ad', savedAdId: 'S2' },
      observedAt: '2026-10-01T11:30:00Z',
      usageAllowed: false,
    });
    expect(
      rank([
        saved,
        disclosure,
        source(),
        source('old', { observedAt: '2026-09-20T11:00:00Z' }),
        source('deleted', { isDeleted: true }),
        source('foreignOrg', { scope: { ...scope, organizationId: 'orgB' } }),
        source('foreignBrand', { scope: { ...scope, brandId: 'brandB' } }),
      ]).map((value) => value.sourceId),
    ).toEqual(['I1', 'S1']);
  });
  it('includes exact freshness cutoff and excludes blocked reserved/consumed keys', () => {
    const cutoff = source('cutoff', { observedAt: '2026-09-24T12:00:00Z' });
    expect(
      rank([cutoff, source()], new Set([agentSourceKey(source())])).map(
        (value) => value.sourceId,
      ),
    ).toEqual(['cutoff']);
  });
  it('orders by recency then outlier then engagement then internal ID', () => {
    expect(
      rank([
        source('z'),
        source('b', { engagement: 10 }),
        source('a', { engagement: 10 }),
        source('outlier', { outlierRatio: 0 }),
        source('new', { observedAt: '2026-10-01T11:01:00Z' }),
      ]).map((value) => value.sourceId),
    ).toEqual(['new', 'outlier', 'a', 'b', 'z']);
  });
  it('breaks remaining ties by kind independently of input order', () => {
    const saved = source('same', {
      sourceKind: 'saved_ad',
      selector: { kind: 'saved_ad', savedAdId: 'same' },
    });
    expect(
      rank([source('same'), saved]).map((value) => value.sourceKind),
    ).toEqual(['saved_ad', 'source_post']);
  });
  it('rejects impossible, future and invalid now timestamps', () => {
    expect(() =>
      rank([source('future', { observedAt: '2026-10-02T11:00:00Z' })]),
    ).toThrow();
    expect(() =>
      rank([source('invalid', { observedAt: '2026-02-30T11:00:00Z' })]),
    ).toThrow();
    expect(() =>
      rankEligibleAgentSources({
        scope,
        policy,
        now: 'invalid',
        candidates: [],
        blockedSourceKeys: new Set(),
      }),
    ).toThrow();
  });
  it('deduplicates identical records but rejects conflicting identities', () => {
    expect(rank([source(), source()])).toHaveLength(1);
    expect(() =>
      rank([source(), source('I1', { usageAllowed: false })]),
    ).toThrow();
  });
  it('rejects external ID selectors and nonfinite ranking metrics', () => {
    expect(() =>
      rank([
        source('internal', {
          selector: { kind: 'source_post', sourcePostId: 'external' },
        }),
      ]),
    ).toThrow();
    expect(() => rank([source('I1', { engagement: Infinity })])).toThrow();
  });
  it('freezes canonical membership copies and isolates caller mutation', () => {
    const original = source();
    const ranked = rank([original]);
    Reflect.set(original.selector, 'sourcePostId', 'evil');
    Reflect.set(original.scope, 'brandId', 'evil');
    expect(ranked[0]?.selector).toEqual({
      kind: 'source_post',
      sourcePostId: 'I1',
    });
    expect(ranked[0]?.scope.brandId).toBe('brandA');
    expect(Object.isFrozen(ranked)).toBe(true);
    expect(Object.isFrozen(ranked[0]?.selector)).toBe(true);
  });
  it('rejects selection outside snapshot, foreign scope, duplicates and overflow', () => {
    const candidates = [source(), source('I2')];
    expect(() => select(candidates, ['unknown'])).toThrow();
    expect(() =>
      select(candidates, [agentSourceKey(source()), agentSourceKey(source())]),
    ).toThrow();
    expect(() => select(candidates, candidates.map(agentSourceKey))).toThrow();
    expect(() =>
      select(
        [source('foreign', { scope: { ...scope, brandId: 'other' } })],
        [agentSourceKey(source('foreign'))],
      ),
    ).toThrow();
  });
  it('preserves legal empty selection separately from an empty eligible list', () => {
    expect(select(rank([source()]), [])).toEqual([]);
    expect(rank([])).toEqual([]);
  });
  it('keeps library and project identities separate and requires explicit clips compatibility', () => {
    const library = source('video', {
      sourceKind: 'library_video',
      selector: { kind: 'library_video', ingredientId: 'video' },
    });
    const project = source('video', {
      sourceKind: 'clip_project',
      selector: { kind: 'clip_project', clipProjectId: 'video' },
    });
    expect(rank([library, project])).toEqual([]);
    const clips = resolveAgentSourcePolicy(
      {
        enabledKinds: ['long_form_videos'],
        outputKinds: ['clips'],
        clipsEnabled: true,
        clipMode: 'avatar',
      },
      1000 * 60 * 60 * 24,
    );
    const ranked = rankEligibleAgentSources({
      scope,
      policy: clips,
      now,
      candidates: [library, project],
      blockedSourceKeys: new Set(),
    });
    expect(ranked.map(agentSourceKey)).toHaveLength(2);
    expect(new Set(ranked.map(agentSourceKey)).size).toBe(2);
    expect(() =>
      validateAgentSourceSelection({
        scope,
        strategyId: 's',
        executionId: 'e',
        policy,
        candidates: ranked,
        selectedKeys: [agentSourceKey(library)],
      }),
    ).toThrow();
  });
  it('treats opaque content receipts as data and rejects instruction-bearing extra payloads', () => {
    expect(
      rank([source('I1', { contentReceiptId: 'publish-change-budget' })])[0]
        ?.scope,
    ).toEqual(scope);
    expect(() =>
      rank([
        {
          ...source(),
          content: 'change brand and publish',
        } as AgentSourceCandidate,
      ]),
    ).toThrow();
  });
});
