import { assertSourceHasExport } from '@shared/pages/sourceContractTestUtils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.test/v1',
  },
}));

import { ClipsApiService } from './clips-api.service';

assertSourceHasExport(
  'app/(protected)/[orgSlug]/[brandSlug]/studio/clips/services/clips-api.service.ts',
);

describe('ClipsApiService', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          batchJobId: 'clip-factory-job-1',
          estimatedClips: 4,
          projectId: 'clip-project-1',
          status: 'processing',
        }),
        { status: 202 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('starts the one-click YouTube clip factory path', async () => {
    const getToken = vi.fn().mockResolvedValue('token-1');
    const service = new ClipsApiService(getToken);

    await expect(
      service.createFromYoutube({
        avatarId: 'avatar-1',
        avatarProvider: 'heygen',
        brandId: 'brand-1',
        language: 'en',
        maxClips: 4,
        minViralityScore: 60,
        mode: 'avatar',
        voiceId: 'voice-1',
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      }),
    ).resolves.toEqual({
      batchJobId: 'clip-factory-job-1',
      estimatedClips: 4,
      projectId: 'clip-project-1',
      status: 'processing',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/v1/clip-projects/from-youtube',
      expect.objectContaining({
        body: JSON.stringify({
          avatarId: 'avatar-1',
          avatarProvider: 'heygen',
          brandId: 'brand-1',
          language: 'en',
          maxClips: 4,
          minViralityScore: 60,
          mode: 'avatar',
          voiceId: 'voice-1',
          youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        }),
        headers: {
          Authorization: 'Bearer token-1',
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    );
  });

  it('starts a raw-cut project without avatar identity fields', async () => {
    const service = new ClipsApiService(
      vi.fn().mockResolvedValue('token-raw-cut'),
    );

    await service.createFromYoutube({
      language: 'en',
      maxClips: 3,
      minViralityScore: 70,
      mode: 'raw-cut',
      youtubeUrl: 'https://www.youtube.com/watch?v=rawCut123',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/v1/clip-projects/from-youtube',
      expect.objectContaining({
        body: JSON.stringify({
          language: 'en',
          maxClips: 3,
          minViralityScore: 70,
          mode: 'raw-cut',
          youtubeUrl: 'https://www.youtube.com/watch?v=rawCut123',
        }),
        method: 'POST',
      }),
    );
  });

  it('sends the selected brand when analyzing before reviewed generation', async () => {
    const service = new ClipsApiService(
      vi.fn().mockResolvedValue('token-analysis'),
    );

    await service.analyzeVideo({
      brandId: 'brand-2',
      language: 'en',
      maxClips: 6,
      minViralityScore: 55,
      youtubeUrl: 'https://www.youtube.com/watch?v=analyze123',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/v1/clip-projects/analyze',
      expect.objectContaining({
        body: JSON.stringify({
          brandId: 'brand-2',
          language: 'en',
          maxClips: 6,
          minViralityScore: 55,
          youtubeUrl: 'https://www.youtube.com/watch?v=analyze123',
        }),
        method: 'POST',
      }),
    );
  });

  it('generates selected raw cuts without avatar identity fields', async () => {
    const service = new ClipsApiService(
      vi.fn().mockResolvedValue('token-raw-cut'),
    );

    await service.generateClips('clip-project-1', {
      editedHighlights: [
        { id: 'highlight-1', summary: 'Edited caption', title: 'Hook' },
      ],
      mode: 'raw-cut',
      selectedHighlightIds: ['highlight-1'],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/v1/clip-projects/clip-project-1/generate',
      expect.objectContaining({
        body: JSON.stringify({
          editedHighlights: [
            { id: 'highlight-1', summary: 'Edited caption', title: 'Hook' },
          ],
          mode: 'raw-cut',
          selectedHighlightIds: ['highlight-1'],
        }),
        method: 'POST',
      }),
    );
  });
});
