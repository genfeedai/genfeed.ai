import {
  axiosResponse,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { YoutubeLongFormService } from '@services/content/youtube-long-form.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('YoutubeLongFormService', () => {
  let http: MockHttpInstance;
  let service: YoutubeLongFormService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = YoutubeLongFormService.getInstance('youtube-long-form-token');
    http = installMockHttp(service);
  });

  it('runs the authenticated long-form workflow', async () => {
    const result = {
      content: 'Article body',
      contentId: 'article-1',
      executionId: 'execution-1',
      outputType: 'linkedin-article',
      sourceArtifactId: 'artifact-1',
      summary: 'Summary',
      title: 'Title',
      videoId: 'video-1',
      youtubeUrl: 'https://youtu.be/video-1',
    } as const;
    http.post.mockResolvedValue(
      axiosResponse(resourceDocument(result, { id: result.contentId })),
    );

    await expect(
      service.create(result.youtubeUrl, result.outputType),
    ).resolves.toEqual(expect.objectContaining(result));
    expect(http.post).toHaveBeenCalledWith('/youtube-long-form', {
      outputType: 'linkedin-article',
      youtubeUrl: result.youtubeUrl,
    });
  });

  it('promotes an expiring source artifact into the Library', async () => {
    http.post.mockResolvedValue(
      axiosResponse(resourceDocument({}, { id: 'ingredient-1' })),
    );

    await expect(
      service.promoteSourceToLibrary('artifact/source'),
    ).resolves.toEqual({ ingredientId: 'ingredient-1' });
    expect(http.post).toHaveBeenCalledWith(
      '/youtube-long-form/artifact%2Fsource/source-library',
    );
  });
});
