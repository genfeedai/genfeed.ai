import { describe, expect, it } from 'vitest';

import { mapClipProjectSummary } from './map-clip-project-summary';

describe('mapClipProjectSummary', () => {
  it('flattens JSON:API attributes into a list card model', () => {
    expect(
      mapClipProjectSummary({
        attributes: {
          brandId: 'brand-1',
          createdAt: '2026-08-20T10:00:00.000Z',
          name: 'Podcast ep 12',
          readyClipCount: 8,
          settings: { mode: 'raw-cut' },
          sourceVideoUrl: 'https://youtu.be/dQw4w9WgXcQ',
          status: 'completed',
        },
        id: 'project-1',
      }),
    ).toEqual({
      brandId: 'brand-1',
      createdAt: '2026-08-20T10:00:00.000Z',
      failedClipCount: 0,
      id: 'project-1',
      isDraft: false,
      mode: 'raw-cut',
      name: 'Podcast ep 12',
      pendingClipCount: 0,
      progress: 0,
      readyClipCount: 8,
      sourceVideoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      status: 'completed',
    });
  });

  it('titles unnamed projects from the YouTube source', () => {
    expect(
      mapClipProjectSummary({
        id: 'project-2',
        sourceVideoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        status: 'analyzing',
      }),
    ).toMatchObject({
      id: 'project-2',
      name: 'YouTube · dQw4w9WgXcQ',
      status: 'analyzing',
    });
  });

  it('marks drafts and previews the YouTube link saved in the draft', () => {
    expect(
      mapClipProjectSummary({
        attributes: {
          draft: {
            sourceKind: 'youtube',
            youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
          },
          name: 'Clip draft — 2026-09-28',
          status: 'draft',
        },
        id: 'draft-1',
      }),
    ).toMatchObject({
      id: 'draft-1',
      isDraft: true,
      name: 'Clip draft — 2026-09-28',
      sourceVideoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      status: 'draft',
    });
  });
});
