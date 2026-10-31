import { PostStatus } from '@genfeedai/contracts';
import { PUBLISHING_POSTS_QUERY_KEYS } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';
import {
  applyRailSegment,
  RELEASE_RAIL_SEGMENTS,
  railSegmentFromFilters,
  railSegmentFromSearchParams,
} from './release-rail-segments.helpers';

describe('release-rail-segments', () => {
  it('lists the canonical rail segments in display order', () => {
    expect(RELEASE_RAIL_SEGMENTS).toEqual([
      'all',
      'draft',
      'scheduled',
      'publishing',
      'published',
      'failed',
    ]);
  });

  describe('railSegmentFromFilters', () => {
    it('resolves published from the posted publication state', () => {
      expect(railSegmentFromFilters({ publicationState: 'posted' })).toBe(
        'published',
      );
    });

    it.each([
      [PostStatus.DRAFT, 'draft'],
      [PostStatus.SCHEDULED, 'scheduled'],
      [PostStatus.PROCESSING, 'publishing'],
      [PostStatus.FAILED, 'failed'],
    ] as const)('resolves %s status to the %s segment', (status, segment) => {
      expect(railSegmentFromFilters({ status })).toBe(segment);
    });

    it('normalizes legacy public and in-flight statuses', () => {
      expect(railSegmentFromFilters({ status: PostStatus.PUBLIC })).toBe(
        'published',
      );
      expect(railSegmentFromFilters({ status: PostStatus.PENDING })).toBe(
        'publishing',
      );
    });

    it('falls back to all when no canonical filter matches', () => {
      expect(railSegmentFromFilters({})).toBe('all');
      expect(railSegmentFromFilters({ status: PostStatus.PRIVATE })).toBe(
        'all',
      );
    });
  });

  describe('railSegmentFromSearchParams', () => {
    it('reads the canonical lifecycle keys from the URL', () => {
      expect(
        railSegmentFromSearchParams(
          new URLSearchParams('platform=youtube&publicationState=posted'),
        ),
      ).toBe('published');
      expect(
        railSegmentFromSearchParams(new URLSearchParams('status=pending')),
      ).toBe('publishing');
    });
  });

  describe('applyRailSegment', () => {
    it('clears both lifecycle keys for the all segment', () => {
      const params = new URLSearchParams(
        `${PUBLISHING_POSTS_QUERY_KEYS.STATUS}=${PostStatus.FAILED}`,
      );
      const next = applyRailSegment(params, 'all');
      expect(next.has(PUBLISHING_POSTS_QUERY_KEYS.STATUS)).toBe(false);
      expect(next.has(PUBLISHING_POSTS_QUERY_KEYS.PUBLICATION_STATE)).toBe(
        false,
      );
    });

    it('sets status=draft for the draft segment', () => {
      const next = applyRailSegment(new URLSearchParams(), 'draft');
      expect(next.get(PUBLISHING_POSTS_QUERY_KEYS.STATUS)).toBe(
        PostStatus.DRAFT,
      );
    });

    it('sets status=scheduled for the scheduled segment', () => {
      const next = applyRailSegment(new URLSearchParams(), 'scheduled');
      expect(next.get(PUBLISHING_POSTS_QUERY_KEYS.STATUS)).toBe(
        PostStatus.SCHEDULED,
      );
    });

    it('sets status=processing for the publishing segment', () => {
      const next = applyRailSegment(new URLSearchParams(), 'publishing');
      expect(next.get(PUBLISHING_POSTS_QUERY_KEYS.STATUS)).toBe(
        PostStatus.PROCESSING,
      );
    });

    it('sets publicationState=posted and clears status for the published segment', () => {
      const params = new URLSearchParams(
        `${PUBLISHING_POSTS_QUERY_KEYS.STATUS}=${PostStatus.DRAFT}`,
      );
      const next = applyRailSegment(params, 'published');
      expect(next.get(PUBLISHING_POSTS_QUERY_KEYS.PUBLICATION_STATE)).toBe(
        'posted',
      );
      expect(next.has(PUBLISHING_POSTS_QUERY_KEYS.STATUS)).toBe(false);
    });

    it('sets status=failed for the failed segment', () => {
      const next = applyRailSegment(new URLSearchParams(), 'failed');
      expect(next.get(PUBLISHING_POSTS_QUERY_KEYS.STATUS)).toBe(
        PostStatus.FAILED,
      );
    });

    it('never mutates the input params', () => {
      const params = new URLSearchParams('page=2');
      applyRailSegment(params, 'failed');
      expect(params.toString()).toBe('page=2');
    });
  });
});
