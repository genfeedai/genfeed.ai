import {
  buildStalledItemsResult,
  classifyStalledPost,
  type StalledCandidatePost,
} from '@api/services/agent-orchestrator/utils/agent-stalled-items.util';
import { TargetExecutionState } from '@genfeedai/contracts';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

const DAY_MS = 86_400_000;
const NOW = new Date('2026-10-27T12:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

function post(overrides: Partial<StalledCandidatePost>): StalledCandidatePost {
  return {
    brandId: 'brand-1',
    createdAt: daysAgo(30),
    description: 'A post about the new pricing page',
    id: 'post-1',
    lastAttemptAt: null,
    platform: 'twitter',
    reviewDecision: null,
    reviewedAt: null,
    scheduledDate: null,
    targetExecutionState: TargetExecutionState.DRAFT,
    userId: 'user-1',
    ...overrides,
  };
}

describe('classifyStalledPost', () => {
  it('lists an unreviewed draft with its creation as the last event', () => {
    expect(
      classifyStalledPost(post({ createdAt: daysAgo(20) }), NOW, 14),
    ).toMatchObject({
      daysStalled: 20,
      kind: 'draft_unreviewed',
      lastEvent: { at: daysAgo(20).toISOString(), type: 'created' },
    });
  });

  it('dates a sent-back draft from its review decision, not its creation', () => {
    expect(
      classifyStalledPost(
        post({
          createdAt: daysAgo(60),
          reviewDecision: 'REQUEST_CHANGES',
          reviewedAt: daysAgo(15),
        }),
        NOW,
        14,
      ),
    ).toMatchObject({
      daysStalled: 15,
      kind: 'changes_not_actioned',
      lastEvent: { at: daysAgo(15).toISOString(), type: 'review_decision' },
    });
  });

  it('treats a rejected draft as not actioned', () => {
    expect(
      classifyStalledPost(
        post({ reviewDecision: 'REJECTED', reviewedAt: daysAgo(20) }),
        NOW,
        14,
      )?.kind,
    ).toBe('changes_not_actioned');
  });

  it('lists an approved draft that was never scheduled', () => {
    expect(
      classifyStalledPost(
        post({ reviewDecision: 'APPROVED', reviewedAt: daysAgo(16) }),
        NOW,
        14,
      ),
    ).toMatchObject({
      kind: 'approved_not_scheduled',
      lastEvent: { type: 'review_decision' },
    });
  });

  it('falls back to creation when a decision has no recorded time', () => {
    expect(
      classifyStalledPost(
        post({ createdAt: daysAgo(40), reviewDecision: 'APPROVED' }),
        NOW,
        14,
      )?.lastEvent,
    ).toEqual({ at: daysAgo(40).toISOString(), type: 'created' });
  });

  it('lists a scheduled post whose slot passed without publishing', () => {
    expect(
      classifyStalledPost(
        post({
          scheduledDate: daysAgo(18),
          targetExecutionState: TargetExecutionState.SCHEDULED,
        }),
        NOW,
        14,
      ),
    ).toMatchObject({
      kind: 'schedule_overdue',
      lastEvent: { at: daysAgo(18).toISOString(), type: 'scheduled_for' },
    });
  });

  it('does not list a post scheduled for the future', () => {
    expect(
      classifyStalledPost(
        post({
          scheduledDate: new Date(NOW.getTime() + DAY_MS),
          targetExecutionState: TargetExecutionState.SCHEDULED,
        }),
        NOW,
        14,
      ),
    ).toBeNull();
  });

  it('dates a failed post from its last publish attempt', () => {
    expect(
      classifyStalledPost(
        post({
          lastAttemptAt: daysAgo(15),
          scheduledDate: daysAgo(40),
          targetExecutionState: TargetExecutionState.FAILED,
        }),
        NOW,
        14,
      ),
    ).toMatchObject({
      kind: 'publish_failed',
      lastEvent: { at: daysAgo(15).toISOString(), type: 'publish_attempt' },
    });
  });

  it('dates a failed post with no attempt from its slot, then from creation', () => {
    const failed = { targetExecutionState: TargetExecutionState.FAILED };
    expect(
      classifyStalledPost(
        post({ ...failed, scheduledDate: daysAgo(20) }),
        NOW,
        14,
      )?.lastEvent.type,
    ).toBe('scheduled_for');
    expect(
      classifyStalledPost(post({ ...failed }), NOW, 14)?.lastEvent.type,
    ).toBe('created');
  });

  it.each([
    TargetExecutionState.PUBLISHED,
    TargetExecutionState.PUBLISHING,
    TargetExecutionState.PAUSED,
    TargetExecutionState.CANCELLED,
    TargetExecutionState.SKIPPED,
  ])('ignores a %s post', (targetExecutionState) => {
    expect(
      classifyStalledPost(post({ targetExecutionState }), NOW, 14),
    ).toBeNull();
  });

  it('leaves a draft that already has a slot to scheduling', () => {
    expect(
      classifyStalledPost(post({ scheduledDate: daysAgo(20) }), NOW, 14),
    ).toBeNull();
  });

  it('counts an item exactly at the window and not one millisecond inside it', () => {
    expect(
      classifyStalledPost(post({ createdAt: daysAgo(14) }), NOW, 14),
    ).not.toBeNull();
    expect(
      classifyStalledPost(
        post({ createdAt: new Date(daysAgo(14).getTime() + 1) }),
        NOW,
        14,
      ),
    ).toBeNull();
  });

  it('keeps the window at 24-hour days across a daylight-saving change', () => {
    // Europe/Berlin leaves summer time on 2026-10-25: that local day is 25 hours.
    const now = new Date('2026-10-26T09:00:00.000Z');
    const createdAt = new Date(now.getTime() - 2 * DAY_MS);
    expect(classifyStalledPost(post({ createdAt }), now, 2)?.daysStalled).toBe(
      2,
    );
    expect(
      classifyStalledPost(
        post({ createdAt: new Date(createdAt.getTime() + 1) }),
        now,
        2,
      ),
    ).toBeNull();
  });

  it('is not reset by an edit: the classifier never reads updatedAt', () => {
    const edited = {
      ...post({ createdAt: daysAgo(30) }),
      updatedAt: NOW,
    } as StalledCandidatePost;
    expect(classifyStalledPost(edited, NOW, 14)).toMatchObject({
      daysStalled: 30,
      kind: 'draft_unreviewed',
    });
  });

  it('trims the preview to 120 characters', () => {
    const item = classifyStalledPost(
      post({ description: `  ${'x'.repeat(300)}  ` }),
      NOW,
      14,
    );
    expect(item?.preview).toHaveLength(120);
  });

  it('only reports items at least a window old, whatever the inputs', () => {
    const states = Object.values(TargetExecutionState);
    fc.assert(
      fc.property(
        fc.constantFrom(...states),
        fc.constantFrom(null, 'APPROVED', 'REJECTED', 'REQUEST_CHANGES'),
        fc.integer({ max: 400, min: 0 }),
        fc.option(fc.integer({ max: 400, min: -30 }), { nil: null }),
        fc.option(fc.integer({ max: 400, min: 0 }), { nil: null }),
        fc.integer({ max: 120, min: 1 }),
        (state, decision, createdDays, scheduledDays, reviewedDays, window) => {
          const item = classifyStalledPost(
            post({
              createdAt: daysAgo(createdDays),
              reviewDecision:
                decision as StalledCandidatePost['reviewDecision'],
              reviewedAt: reviewedDays === null ? null : daysAgo(reviewedDays),
              scheduledDate:
                scheduledDays === null ? null : daysAgo(scheduledDays),
              targetExecutionState: state,
            }),
            NOW,
            window,
          );
          if (item) {
            expect(
              NOW.getTime() - Date.parse(item.lastEvent.at),
            ).toBeGreaterThanOrEqual(window * DAY_MS);
            expect(item.daysStalled).toBeGreaterThanOrEqual(window);
          }
        },
      ),
    );
  });
});

describe('buildStalledItemsResult', () => {
  const posts = [
    post({ createdAt: daysAgo(20), id: 'b' }),
    post({ createdAt: daysAgo(90), id: 'z' }),
    post({ createdAt: daysAgo(90), id: 'a' }),
    post({ createdAt: daysAgo(2), id: 'fresh' }),
  ];

  it('orders the oldest stall first and breaks ties by id', () => {
    const result = buildStalledItemsResult({
      isScanLimited: false,
      limit: 10,
      now: NOW,
      posts,
      windowDays: 14,
    });
    expect(result.items.map((item) => item.postId)).toEqual(['a', 'z', 'b']);
    expect(result.isTruncated).toBe(false);
  });

  it('reports truncation and carries the scan flag through', () => {
    const result = buildStalledItemsResult({
      isScanLimited: true,
      limit: 2,
      now: NOW,
      posts,
      windowDays: 14,
    });
    expect(result.items.map((item) => item.postId)).toEqual(['a', 'z']);
    expect(result).toMatchObject({
      isScanLimited: true,
      isTruncated: true,
      windowDays: 14,
    });
  });
});
