import { BatchItemStatus, ContentFormat } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

import {
  formatReviewItemStatus,
  getReviewItemBadgeStatus,
  getReviewItemTitle,
  isReviewItemSelectable,
} from './review-item.helpers';

const baseItem = {
  batchId: 'batch-1',
  caption: '  Ship it  ',
  createdAt: '2026-03-10T10:00:00.000Z',
  format: ContentFormat.IMAGE,
  id: 'item-1',
  platform: 'twitter',
  status: BatchItemStatus.COMPLETED,
};

describe('review-item.helpers', () => {
  it('formats review statuses for the queue table', () => {
    expect(formatReviewItemStatus(baseItem)).toBe('Ready');
    expect(
      formatReviewItemStatus({
        ...baseItem,
        reviewDecision: 'approved',
      }),
    ).toBe('Approved');
    expect(
      formatReviewItemStatus({
        ...baseItem,
        status: BatchItemStatus.FAILED,
      }),
    ).toBe('Failed');
    expect(
      formatReviewItemStatus({
        ...baseItem,
        status: BatchItemStatus.SKIPPED,
      }),
    ).toBe('Rejected');
    expect(
      formatReviewItemStatus({
        ...baseItem,
        reviewDecision: 'rejected',
      }),
    ).toBe('Rejected');
  });

  it('prefers caption, then prompt, then draft fallback for the title', () => {
    expect(getReviewItemTitle(baseItem)).toBe('Ship it');
    expect(
      getReviewItemTitle({
        ...baseItem,
        caption: '',
        prompt: 'Prompt text',
      }),
    ).toBe('Prompt text');
    expect(
      getReviewItemTitle({
        ...baseItem,
        caption: '',
        postId: 'post-1',
        prompt: '',
      }),
    ).toBe('Draft post');
  });

  it('only marks completed ready items as selectable', () => {
    expect(isReviewItemSelectable(baseItem)).toBe(true);
    expect(
      isReviewItemSelectable({
        ...baseItem,
        status: BatchItemStatus.PENDING,
      }),
    ).toBe(false);
  });

  it('maps badge status tokens without overriding product labels', () => {
    expect(getReviewItemBadgeStatus(baseItem)).toBeUndefined();
    expect(
      getReviewItemBadgeStatus({
        ...baseItem,
        reviewDecision: 'approved',
      }),
    ).toBe('completed');
    expect(
      getReviewItemBadgeStatus({
        ...baseItem,
        reviewDecision: 'rejected',
      }),
    ).toBe('failed');
    expect(
      getReviewItemBadgeStatus({
        ...baseItem,
        status: BatchItemStatus.SKIPPED,
      }),
    ).toBe('failed');
    expect(
      getReviewItemBadgeStatus({
        ...baseItem,
        status: BatchItemStatus.FAILED,
      }),
    ).toBe('failed');
    expect(
      getReviewItemBadgeStatus({
        ...baseItem,
        status: BatchItemStatus.PENDING,
      }),
    ).toBe('pending');
    expect(
      getReviewItemBadgeStatus({
        ...baseItem,
        reviewDecision: 'request_changes',
      }),
    ).toBeUndefined();
  });
});
