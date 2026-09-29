import { describe, expect, it } from 'vitest';

import { mapClipProjectSummary } from './map-clip-project-summary';

describe('mapClipProjectSummary', () => {
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
