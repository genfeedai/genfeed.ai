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

  it('lists clip projects from the collection endpoint', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            {
              attributes: {
                name: 'Podcast ep 12',
                readyClipCount: 4,
                settings: { mode: 'raw-cut' },
                sourceVideoUrl: 'https://youtu.be/dQw4w9WgXcQ',
                status: 'completed',
              },
              id: 'project-1',
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const service = new ClipsApiService(
      vi.fn().mockResolvedValue('token-list'),
    );
    await expect(service.listProjects()).resolves.toEqual([
      {
        brandId: undefined,
        createdAt: undefined,
        failedClipCount: 0,
        id: 'project-1',
        mode: 'raw-cut',
        name: 'Podcast ep 12',
        pendingClipCount: 0,
        progress: 0,
        readyClipCount: 4,
        sourceVideoUrl: 'https://youtu.be/dQw4w9WgXcQ',
        status: 'completed',
      },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/v1/clip-projects?sort=-createdAt',
      expect.objectContaining({
        headers: { Authorization: 'Bearer token-list' },
      }),
    );
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

  it('prepares and finalizes a durable uploaded source', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            expiresIn: 3600,
            ingredientId: 'ingredient-1',
            projectId: 'clip-project-upload',
            publicUrl: 'https://cdn.test/ingredient-1',
            uploadUrl: 'https://uploads.test/ingredient-1',
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            batchJobId: 'clip-analyze-clip-project-upload',
            estimatedClips: 6,
            projectId: 'clip-project-upload',
            status: 'analyzing',
          }),
          { status: 202 },
        ),
      );
    const service = new ClipsApiService(
      vi.fn().mockResolvedValue('token-upload'),
    );
    const payload = {
      contentType: 'video/mp4',
      filename: 'podcast.mp4',
      flow: 'review' as const,
      language: 'en',
      maxClips: 6,
      minViralityScore: 50,
      mode: 'raw-cut' as const,
      sizeBytes: 4_000_000_000,
    };

    await expect(service.prepareUpload(payload)).resolves.toMatchObject({
      projectId: 'clip-project-upload',
      uploadUrl: 'https://uploads.test/ingredient-1',
    });
    await expect(
      service.finalizeUpload('clip-project-upload'),
    ).resolves.toMatchObject({ status: 'analyzing' });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.test/v1/clip-projects/from-upload',
      expect.objectContaining({
        body: JSON.stringify(payload),
        method: 'POST',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.test/v1/clip-projects/clip-project-upload/source/finalize',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('retries a source after the server marks its lifecycle as failed', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          batchJobId: 'clip-analyze-clip-project-upload',
          estimatedClips: 6,
          projectId: 'clip-project-upload',
          status: 'queued',
        }),
        { status: 202 },
      ),
    );
    const service = new ClipsApiService(
      vi.fn().mockResolvedValue('token-upload-retry'),
    );

    await expect(
      service.retrySource('clip-project-upload'),
    ).resolves.toMatchObject({ status: 'queued' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/v1/clip-projects/clip-project-upload/source/retry',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('retries only failed project results through the recovery endpoint', async () => {
    const service = new ClipsApiService(
      vi.fn().mockResolvedValue('token-retry-results'),
    );

    await service.retryFailedClips('clip-project-1');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/v1/clip-projects/clip-project-1/retry-failed',
      expect.objectContaining({ method: 'POST' }),
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

  it('selects a reference frame through the project mutation route', async () => {
    const referenceFrames = {
      candidates: [
        {
          diagnostics: [],
          id: 'frame-1',
          status: 'available',
          timestampSeconds: 12,
          url: 'https://cdn.test/frame-1.jpg',
        },
      ],
      diagnostics: [],
      schemaVersion: 1,
      selectedCandidateId: 'frame-1',
      status: 'selected',
    };
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: { attributes: { referenceFrames } } }),
        { status: 200 },
      ),
    );
    const service = new ClipsApiService(
      vi.fn().mockResolvedValue('token-reference-frame'),
    );

    await expect(
      service.selectReferenceFrame('clip-project-1', 'frame-1'),
    ).resolves.toEqual(referenceFrames);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/v1/clip-projects/clip-project-1/reference-frame',
      expect.objectContaining({
        body: JSON.stringify({ candidateId: 'frame-1' }),
        headers: {
          Authorization: 'Bearer token-reference-frame',
          'Content-Type': 'application/json',
        },
        method: 'PUT',
      }),
    );
  });

  it('reads and submits the trusted hook approval contract', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              attempt: 1,
              hookClipResultId: 'hook-result-1',
              remainingClipCount: 3,
              state: 'awaiting_confirmation',
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              attempt: 1,
              hookClipResultId: 'hook-result-1',
              lastAction: 'approve',
              remainingClipCount: 3,
              state: 'approved',
            },
          }),
          { status: 200 },
        ),
      );
    const service = new ClipsApiService(
      vi.fn().mockResolvedValue('token-approval'),
    );

    await expect(service.getHookApproval('clip-project-1')).resolves.toEqual(
      expect.objectContaining({ state: 'awaiting_confirmation' }),
    );
    await expect(
      service.submitHookApproval('clip-project-1', {
        action: 'approve',
      }),
    ).resolves.toEqual(expect.objectContaining({ state: 'approved' }));

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.test/v1/clip-projects/clip-project-1/hook-approval',
      expect.objectContaining({
        body: JSON.stringify({ action: 'approve' }),
        method: 'POST',
      }),
    );
  });

  it('retries Library linking without generating a new clip', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          clipResultId: 'clip-1',
          ingredientId: 'ingredient-1',
          status: 'linked',
        }),
        { status: 200 },
      ),
    );
    const service = new ClipsApiService(
      vi.fn().mockResolvedValue('token-library-link'),
    );

    await expect(
      service.retryLibraryLink('clip-project-1', 'clip-1'),
    ).resolves.toEqual({
      clipResultId: 'clip-1',
      ingredientId: 'ingredient-1',
      status: 'linked',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/v1/clip-projects/clip-project-1/results/clip-1/library-link',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });
});
