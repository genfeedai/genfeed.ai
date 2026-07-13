import { describe, expect, it } from 'vitest';
import {
  buildResearchWorkSurfaceHref,
  encodeResearchFindingReference,
  parseResearchFindingReference,
  parseResearchWorkSurfaceUrl,
} from './research-work-surface-url';

describe('Research work surface URL contract', () => {
  it('restores canonical filters, pagination, selection, and opaque shell state', () => {
    const state = parseResearchWorkSurfaceUrl(
      new URLSearchParams({
        finding: 'research-trend-video:video-123',
        page: '3',
        platform: 'tiktok',
        q: 'viral hooks',
        thread: 'thread-1',
      }),
    );

    expect(state).toMatchObject({
      isCanonical: true,
      page: 3,
      query: 'viral hooks',
      requestedReference: {
        id: 'video-123',
        kind: 'research-trend-video',
      },
    });
    expect(state.canonicalSearchParams.toString()).toContain('platform=tiktok');
    expect(state.canonicalSearchParams.toString()).toContain('thread=thread-1');
  });

  it('removes malformed owned state without dropping opaque route parameters', () => {
    const state = parseResearchWorkSurfaceUrl(
      new URLSearchParams({
        finding: 'approval:grant-access',
        page: '10001',
        q: '   ',
        source: 'public',
        thread: 'thread-1',
      }),
    );

    expect(state).toMatchObject({
      isCanonical: false,
      page: 1,
      query: '',
      requestedReference: null,
    });
    expect(state.canonicalSearchParams.toString()).toBe(
      'source=public&thread=thread-1',
    );
  });

  it('accepts only finite typed finding references with safe identifiers', () => {
    const reference = {
      id: 'post_123.4',
      kind: 'research-source-post' as const,
    };

    expect(
      parseResearchFindingReference(encodeResearchFindingReference(reference)),
    ).toEqual(reference);
    expect(
      parseResearchFindingReference('research-source-post:../../admin'),
    ).toBeNull();
    expect(
      buildResearchWorkSurfaceHref(
        '/acme/moonrise/research/following',
        new URLSearchParams({ page: '2' }),
      ),
    ).toBe('/acme/moonrise/research/following?page=2');
  });
});
