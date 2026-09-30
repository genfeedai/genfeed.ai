import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import type { StoryboardDraftTransport } from '@genfeedai/props/studio/storyboard.props';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  StoryboardDraftOutbox,
  storyboardDraftKey,
  storyboardDraftValue,
} from './storyboard-draft-outbox';
import { reconcileStoryboardDraft } from './storyboard-draft-reconcile';

const plan: StoryboardPlan = {
  title: 'Base',
  logline: 'Story',
  format: '9:16',
  videoModelKey: null,
  runtimeBudgetSeconds: 10,
  styleReferenceAssetIds: [],
  cast: [],
  shots: [
    {
      id: 'opaque-shot-1',
      ordinal: 1,
      action: 'Walk',
      onScreenSpeaker: false,
      durationSeconds: 5,
      stillFreshness: 'fresh',
      stillAssetId: 'still-1',
      transition: 'cut',
    },
  ],
};
function fixture() {
  let run: StoryboardRun = {
    id: 'run',
    organizationId: 'org',
    brandId: 'brand',
    createdAt: '2026-09-30T00:00:00Z',
    updatedAt: '2026-09-30T00:00:00Z',
    config: {
      contract: 'storyboard-run',
      version: 1,
      revision: 1,
      clientRequestId: 'f86c1871-d577-4dca-b79d-6d9f295a58cc',
      createdByUserId: 'user',
      submittedInputHash: 'a'.repeat(64),
      state: 'storyboard',
      sourceSnapshot: {
        selector: { kind: 'brief', brief: 'Idea' },
        capturedAt: '2026-09-30T00:00:00Z',
      },
      plan: structuredClone(plan),
    },
  };
  const transport: StoryboardDraftTransport = {
    scope: {
      server: 'api-1',
      userId: 'user',
      organizationId: 'org',
      brandId: 'brand',
      runId: 'run',
    },
    canDispatch: vi.fn(async () => true),
    read: vi.fn(async () => structuredClone(run)),
    write: vi.fn(async (channel, revision, value) => {
      if (revision !== run.config.revision)
        throw { errors: [{ status: '409', detail: 'Revision changed' }] };
      run = {
        ...run,
        config: {
          ...run.config,
          revision: revision + 1,
          ...(channel === 'plan'
            ? { plan: value.plan }
            : {
                sourceSnapshot: {
                  selector: value.source,
                  capturedAt: '2026-09-30T00:00:00Z',
                },
                plan: {
                  ...run.config.plan,
                  shots: run.config.plan.shots.map((shot) => ({
                    ...shot,
                    stillFreshness: 'stale' as const,
                  })),
                },
              }),
        },
      };
      return structuredClone(run);
    }),
  };
  return {
    transport,
    queue: new StoryboardDraftOutbox(transport, run),
    getRun: () => run,
    remote: (patch: Partial<StoryboardPlan>) => {
      run = {
        ...run,
        config: {
          ...run.config,
          revision: run.config.revision + 1,
          plan: { ...run.config.plan, ...patch },
        },
      };
    },
  };
}
describe('scoped shared Storyboard draft outbox', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });
  afterEach(() => vi.useRealTimers());
  it('persists before the debounce, drains after detachment, serializes source and plan revisions and preserves remote freshness', async () => {
    vi.useFakeTimers();
    const { queue, transport, getRun } = fixture();
    await queue.initialize();
    queue.edit('source', { kind: 'brief', brief: 'New source' });
    queue.edit('plan', { ...plan, title: 'New title' });
    expect(
      sessionStorage.getItem(storyboardDraftKey(transport.scope)),
    ).toContain('New title');
    queue.detach();
    await queue.flush();
    expect(
      vi.mocked(transport.write).mock.calls.map((call) => [call[0], call[1]]),
    ).toEqual([
      ['source', 1],
      ['plan', 2],
    ]);
    expect(getRun().config.plan.title).toBe('New title');
    expect(getRun().config.plan.shots[0].stillFreshness).toBe('stale');
    expect(queue.getSnapshot().status).toBe('saved');
    expect(
      sessionStorage.getItem(storyboardDraftKey(transport.scope)),
    ).toBeNull();
  });
  it('retains edits made during an in-flight request and after unmount', async () => {
    const { queue, transport, getRun } = fixture();
    await queue.initialize();
    const write = vi.mocked(transport.write).getMockImplementation();
    if (!write) throw new Error('Missing test transport');
    let finish: () => void = () => undefined;
    vi.mocked(transport.write).mockImplementationOnce(async (...args) => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return write(...args);
    });
    queue.edit('plan', { ...plan, title: 'First' });
    const saving = queue.flush();
    await vi.waitFor(() => expect(transport.write).toHaveBeenCalled());
    queue.edit('plan', { ...plan, title: 'Latest' });
    queue.detach();
    finish();
    await saving;
    expect(getRun().config.plan.title).toBe('Latest');
    expect(getRun().config.revision).toBe(3);
  });
  it('acknowledges a committed PATCH whose response was lost by GET without duplicate PATCH', async () => {
    const { queue, transport } = fixture();
    await queue.initialize();
    const write = vi.mocked(transport.write).getMockImplementation();
    if (!write) throw new Error('Missing test transport');
    vi.mocked(transport.write).mockImplementationOnce(async (...args) => {
      await write(...args);
      throw new Error('Lost response');
    });
    queue.edit('plan', { ...plan, title: 'Committed' });
    await queue.flush();
    expect(transport.write).toHaveBeenCalledOnce();
    expect(queue.getSnapshot().revision).toBe(2);
    expect(queue.getSnapshot().status).toBe('saved');
  });
  it('rereads after a real CAS conflict and retries disjoint edits at the new revision', async () => {
    const { queue, remote, getRun, transport } = fixture();
    await queue.initialize();
    queue.edit('plan', { ...plan, title: 'Local title' });
    remote({ logline: 'Remote story' });
    await expect(queue.flush()).rejects.toMatchObject({
      errors: [{ status: '409' }],
    });
    expect(queue.getSnapshot().value.plan).toMatchObject({
      title: 'Local title',
      logline: 'Remote story',
    });
    await queue.flush();
    expect(getRun().config.revision).toBe(3);
    expect(vi.mocked(transport.write).mock.calls[1][1]).toBe(2);
  });
  it('blocks conflicting leaves until every version is explicitly chosen and preserves the recovery snapshot', async () => {
    const { queue, remote, transport, getRun } = fixture();
    await queue.initialize();
    queue.edit('plan', { ...plan, title: 'Your title' });
    remote({ title: 'Saved title' });
    await expect(queue.flush()).rejects.toBeDefined();
    expect(queue.getSnapshot().conflicts.map((entry) => entry.path)).toEqual([
      'plan.title',
    ]);
    await expect(queue.resolve()).rejects.toThrow('Choose a version');
    queue.choose('plan.title', 'local');
    await queue.resolve();
    expect(getRun().config.plan.title).toBe('Your title');
    expect(
      sessionStorage.getItem(storyboardDraftKey(transport.scope)),
    ).toBeNull();
  });
  it('restores only its exact scope and suspends undispatched work across account/server switches', async () => {
    const first = fixture();
    await first.queue.initialize();
    first.queue.edit('plan', { ...plan, title: 'Recover me' });
    vi.mocked(first.transport.canDispatch).mockResolvedValue(false);
    await expect(first.queue.flush()).rejects.toThrow('paused');
    expect(first.transport.write).not.toHaveBeenCalled();
    const foreign = fixture();
    foreign.transport.scope = {
      ...foreign.transport.scope,
      userId: 'other-user',
      organizationId: 'other-org',
      server: 'other-api',
    };
    const unrelated = new StoryboardDraftOutbox(
      foreign.transport,
      foreign.getRun(),
    );
    expect(unrelated.getSnapshot().value.plan.title).toBe('Base');
    vi.mocked(first.transport.canDispatch).mockResolvedValue(true);
    const restored = new StoryboardDraftOutbox(first.transport, first.getRun());
    await restored.initialize();
    expect(restored.getSnapshot().value.plan.title).toBe('Recover me');
    await restored.flush();
    expect(first.getRun().config.plan.title).toBe('Recover me');
  });
  it('retains recovery and readable errors for forbidden/deleted writes without creating another run', async () => {
    for (const status of [403, 404, 410]) {
      const { queue, transport } = fixture();
      await queue.initialize();
      vi.mocked(transport.write).mockRejectedValue({
        errors: [{ status: String(status), detail: 'Run unavailable' }],
      });
      queue.edit('plan', { ...plan, title: 'Kept' });
      await expect(queue.flush()).rejects.toBeDefined();
      expect(queue.getSnapshot()).toMatchObject({
        status: 'failed',
        error: 'Run unavailable',
      });
      expect(
        sessionStorage.getItem(storyboardDraftKey(transport.scope)),
      ).toContain('Kept');
      sessionStorage.clear();
    }
  });
  it('retains incomplete source text and exact whitespace across a recovery restore', async () => {
    const { queue, transport, getRun } = fixture();
    await queue.initialize();
    queue.edit('source', { kind: 'brief', brief: '' });
    queue.edit('plan', { ...plan, title: '  Unfinished title  ' });
    vi.mocked(transport.canDispatch).mockResolvedValue(false);
    await expect(queue.flush()).rejects.toThrow('paused');
    vi.mocked(transport.canDispatch).mockResolvedValue(true);
    const restored = new StoryboardDraftOutbox(transport, getRun());
    await restored.initialize();
    expect(restored.getSnapshot().value.source).toEqual({
      kind: 'brief',
      brief: '',
    });
    expect(restored.getSnapshot().value.plan.title).toBe(
      '  Unfinished title  ',
    );
    restored.edit('source', { kind: 'brief', brief: 'Finished' });
    await restored.flush();
  });
  it('surfaces storage failure rather than claiming navigation recovery', async () => {
    const { queue } = fixture();
    await queue.initialize();
    const failure = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('Full');
      });
    queue.edit('plan', { ...plan, title: 'Not recovered' });
    expect(queue.getSnapshot().storageError).toContain('unavailable');
    failure.mockRestore();
    await queue.flush();
  });
});
describe('three-way editable Storyboard reconciliation', () => {
  it('merges disjoint opaque-ID shot leaves and keeps remote freshness', () => {
    const { getRun } = fixture();
    const base = storyboardDraftValue(getRun());
    const local = {
      ...base,
      plan: {
        ...base.plan,
        shots: [{ ...base.plan.shots[0], dialogue: 'Local' }],
      },
    };
    const remote = {
      ...base,
      plan: {
        ...base.plan,
        shots: [
          {
            ...base.plan.shots[0],
            notes: 'Remote',
            stillFreshness: 'stale' as const,
          },
        ],
      },
    };
    const result = reconcileStoryboardDraft(base, local, remote);
    expect(result.conflicts).toHaveLength(0);
    expect(result.value.plan.shots[0]).toMatchObject({
      dialogue: 'Local',
      notes: 'Remote',
      stillFreshness: 'stale',
    });
  });
  it('treats ordered membership changes and reference arrays as atomic conflict units', () => {
    const { getRun } = fixture();
    const base = storyboardDraftValue(getRun());
    const local = {
      ...base,
      plan: { ...base.plan, shots: [], styleReferenceAssetIds: ['local-ref'] },
    };
    const remote = {
      ...base,
      plan: {
        ...base.plan,
        shots: [{ ...base.plan.shots[0], action: 'Changed' }],
        styleReferenceAssetIds: ['remote-ref'],
      },
    };
    expect(
      reconcileStoryboardDraft(base, local, remote)
        .conflicts.map((entry) => entry.path)
        .sort(),
    ).toEqual(['plan.shots', 'plan.styleReferenceAssetIds']);
  });
});
