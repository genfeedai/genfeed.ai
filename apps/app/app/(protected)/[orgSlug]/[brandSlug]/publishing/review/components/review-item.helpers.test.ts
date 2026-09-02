import { BatchItemStatus, ContentFormat } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

import {
  buildReviewItemTargetPreview,
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

  it('builds a target preview from the stored platform and media', () => {
    const preview = buildReviewItemTargetPreview({
      ...baseItem,
      mediaUrl: 'https://cdn.example.com/media.jpg',
    });

    expect(preview?.target.platform).toBe('twitter');
    expect(preview?.credential.platform).toBe('twitter');
    expect(preview?.release.baseContent).toBe('Ship it');
    expect(preview?.target.settings.caption).toBe('Ship it');
    expect(preview?.release.title).toBe('Ship it');
    expect(preview?.release.media).toEqual([
      {
        assetId: 'item-1-media',
        kind: 'image',
        order: 0,
        url: 'https://cdn.example.com/media.jpg',
      },
    ]);
  });

  it('maps video-like formats onto preview media kinds', () => {
    const withFormat = (format: ContentFormat) =>
      buildReviewItemTargetPreview({
        ...baseItem,
        format,
        mediaUrl: 'https://cdn.example.com/media.mp4',
      });

    expect(withFormat(ContentFormat.REEL)?.release.media[0]?.kind).toBe(
      'short_video',
    );
    expect(withFormat(ContentFormat.VIDEO)?.release.media[0]?.kind).toBe(
      'video',
    );
    expect(withFormat(ContentFormat.CAROUSEL)?.release.media[0]?.kind).toBe(
      'carousel',
    );
    expect(withFormat(ContentFormat.STORY)?.release.media[0]?.kind).toBe(
      'image',
    );
  });

  it('falls back to the prompt caption when there is no caption', () => {
    const preview = buildReviewItemTargetPreview({
      ...baseItem,
      caption: '',
      prompt: 'Prompt text',
    });

    expect(preview?.release.baseContent).toBe('Prompt text');
    expect(preview?.release.media).toEqual([]);
  });

  it('returns null when the platform cannot be resolved', () => {
    expect(
      buildReviewItemTargetPreview({
        ...baseItem,
        platform: undefined,
      }),
    ).toBeNull();
    expect(
      buildReviewItemTargetPreview({
        ...baseItem,
        platform: 'not-a-real-platform',
      }),
    ).toBeNull();
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
