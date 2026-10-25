import {
  axiosResponse,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { ClipperProjectsService } from '@services/content/clipper-projects.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ClipperProjectsService', () => {
  let service: ClipperProjectsService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = ClipperProjectsService.getInstance('claim-test-token');
    http = installMockHttp(service);
  });

  it('claims the opaque public capability into a canonical clip project', async () => {
    http.post.mockResolvedValue(
      axiosResponse(
        resourceDocument(
          { status: 'analyzed' },
          { id: 'public-youtube-clipper-project' },
        ),
      ),
    );

    await expect(
      service.claimPublicYoutubeClipper({
        brandId: 'brand-1',
        previewToken: 'a'.repeat(43),
      }),
    ).resolves.toEqual({
      projectId: 'public-youtube-clipper-project',
      status: 'claimed',
    });
    expect(http.post).toHaveBeenCalledWith('public-tool/claim', {
      brandId: 'brand-1',
      previewToken: 'a'.repeat(43),
    });
  });
});
