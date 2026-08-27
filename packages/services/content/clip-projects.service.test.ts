import {
  axiosResponse,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { ClipProjectsService } from '@services/content/clip-projects.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ClipProjectsService', () => {
  let service: ClipProjectsService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = ClipProjectsService.getInstance('claim-test-token');
    http = installMockHttp(service);
  });

  it('claims the opaque public capability into a canonical clip project', async () => {
    http.post.mockResolvedValue(
      axiosResponse(
        resourceDocument(
          { status: 'analyzed' },
          { id: 'public-youtube-clip-project' },
        ),
      ),
    );

    await expect(
      service.claimPublicYoutubeClip({
        brandId: 'brand-1',
        previewToken: 'a'.repeat(43),
      }),
    ).resolves.toEqual({
      projectId: 'public-youtube-clip-project',
      status: 'claimed',
    });
    expect(http.post).toHaveBeenCalledWith('public-tool/claim', {
      brandId: 'brand-1',
      previewToken: 'a'.repeat(43),
    });
  });
});
