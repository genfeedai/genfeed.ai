import {
  buildReadyDraftReceipt,
  cadencePublicationDate,
  getCadenceDemand,
  getCadenceWeek,
  isReadyCadenceDraft,
  recordReadyDraftReceipt,
  resolveCadencePolicy,
} from '@api/collections/agent-strategies/services/agent-strategy-cadence.util';
import type { PostDocument } from '@api/collections/posts/post.schema';
import type { PostsService } from '@api/collections/posts/services/posts.service';
import {
  PersistedReviewDecision,
  TargetExecutionState,
} from '@genfeedai/contracts';

describe('strategy cadence', () => {
  it('counts a delayed in-flight publication against the week it is sending in', () => {
    const now = new Date('2026-10-08T12:00:00Z');
    expect(
      cadencePublicationDate(
        {
          targetExecutionState: TargetExecutionState.PUBLISHING,
          scheduledDate: new Date('2026-10-01T12:00:00Z'),
        },
        now,
      ),
    ).toEqual(now);
  });
  it('retains the evaluated digest when content changes while the gate is running', async () => {
    const original = {
      id: 'draft',
      description: 'Original content',
      targetExecutionState: TargetExecutionState.DRAFT,
    };
    const posts = {
      findOne: vi.fn().mockResolvedValue({
        ...original,
        description: 'Edited during evaluation',
      }),
      patch: vi.fn(),
    };
    const evaluatedReceipt = buildReadyDraftReceipt(original);
    await recordReadyDraftReceipt(
      posts as unknown as Pick<PostsService, 'findOne' | 'patch'>,
      {
        draft: original as unknown as PostDocument,
        organizationId: 'organization',
        evaluatedReceipt,
      },
    );
    const update = posts.patch.mock.calls[0][1];
    expect(
      isReadyCadenceDraft({
        ...original,
        description: 'Edited during evaluation',
        ...update,
      }),
    ).toBe(false);
    expect(isReadyCadenceDraft({ ...original, ...update })).toBe(true);
  });
  it('preserves legacy limits until separate controls are configured', () => {
    expect(resolveCadencePolicy({ postsPerWeek: 7 })).toEqual({
      separate: false,
      target: 7,
      ceiling: 7,
      reserve: 0,
    });
    expect(
      resolveCadencePolicy({
        postsPerWeek: 7,
        publishingCeilingPerWeek: 14,
        readyDraftReserve: 3,
      }),
    ).toEqual({
      separate: true,
      target: 7,
      ceiling: 14,
      reserve: 3,
    });
  });

  it.each([
    { postsPerWeek: 7, publishingCeilingPerWeek: 6 },
    { postsPerWeek: 7, readyDraftReserve: -1 },
    { postsPerWeek: 7, publishingCeilingPerWeek: 1.5 },
    { postsPerWeek: 7, readyDraftReserve: 101 },
  ])('fails closed on invalid separate controls (%j)', (input) => {
    expect(() => resolveCadencePolicy(input)).toThrow();
  });

  it.each([
    [
      '2026-03-08T12:00:00Z',
      '2026-03-02T05:00:00.000Z',
      '2026-03-09T04:00:00.000Z',
    ],
    [
      '2026-11-01T12:00:00Z',
      '2026-10-26T04:00:00.000Z',
      '2026-11-02T05:00:00.000Z',
    ],
  ])('uses a complete local ISO week across DST (%s)', (now, start, end) => {
    expect(getCadenceWeek('America/New_York', new Date(now))).toEqual({
      start: new Date(start),
      end: new Date(end),
    });
  });

  it('separates posting coverage from reserve and subtracts pending supply', () => {
    const policy = resolveCadencePolicy({
      postsPerWeek: 7,
      publishingCeilingPerWeek: 14,
      readyDraftReserve: 3,
    });
    expect(
      getCadenceDemand(policy, { week: 4, readyDrafts: 2, pendingDrafts: 1 }),
    ).toEqual({
      posting: 0,
      reserve: 3,
      generation: 3,
      publicationSlots: 10,
    });
    expect(
      getCadenceDemand(policy, { week: 7, readyDrafts: 3, pendingDrafts: 0 }),
    ).toEqual({
      posting: 0,
      reserve: 0,
      generation: 0,
      publicationSlots: 7,
    });
    expect(
      getCadenceDemand(policy, { week: 14, readyDrafts: 0, pendingDrafts: 0 }),
    ).toEqual({
      posting: 0,
      reserve: 3,
      generation: 3,
      publicationSlots: 0,
    });
  });

  it('requires an unchanged quality receipt and an unscheduled unrejected draft', () => {
    const draft = {
      id: 'draft',
      brandId: 'brand',
      category: 'text',
      description: 'A useful post',
      targetExecutionState: TargetExecutionState.DRAFT,
      targetSettings: { generation: { metadata: {} } },
    };
    const receipt = buildReadyDraftReceipt(draft);
    const ready = {
      ...draft,
      targetSettings: {
        generation: {
          metadata: { cadenceQualityReceipt: receipt, reviewBatchId: 'batch' },
        },
      },
    };
    expect(isReadyCadenceDraft(ready)).toBe(true);
    expect(
      isReadyCadenceDraft({ ...ready, description: 'Edited content' }),
    ).toBe(false);
    expect(
      isReadyCadenceDraft({
        ...ready,
        targetExecutionState: TargetExecutionState.SCHEDULED,
      }),
    ).toBe(false);
    expect(
      isReadyCadenceDraft({
        ...ready,
        reviewDecision: PersistedReviewDecision.REJECTED,
      }),
    ).toBe(false);
    expect(isReadyCadenceDraft(draft)).toBe(false);
  });
});
