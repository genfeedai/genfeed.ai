import { TagScope } from '@genfeedai/contracts';
import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { TagsService } from '@services/content/tags.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('TagsService library tags (#6011)', () => {
  let service: TagsService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    TagsService.clearInstance();
    service = new TagsService('tags-token');
    http = installMockHttp(service);
  });

  it('lists the brand’s tags with their scope and asset count', async () => {
    http.get.mockResolvedValue(
      axiosResponse(
        collectionDocument(
          [
            {
              assetCount: 14,
              backgroundColor: '#000000',
              id: 'tag-1',
              label: 'S1E12',
              scope: TagScope.BRAND,
              textColor: '#ffffff',
            },
            {
              assetCount: 3,
              backgroundColor: '#111111',
              id: 'tag-2',
              label: 'Launch',
              scope: TagScope.ORGANIZATION,
              textColor: '#ffffff',
            },
          ],
          { type: 'tag' },
        ),
      ),
    );

    const tags = await service.findLibraryTags({
      brandId: 'brand-1',
      search: 's1',
    });

    expect(http.get).toHaveBeenCalledWith('library', {
      params: { brandId: 'brand-1', search: 's1' },
      signal: undefined,
    });
    expect(tags.map((tag) => [tag.label, tag.scope, tag.assetCount])).toEqual([
      ['S1E12', TagScope.BRAND, 14],
      ['Launch', TagScope.ORGANIZATION, 3],
    ]);
  });

  it('asks for the active brand when none is given, and forwards cancellation', async () => {
    http.get.mockResolvedValue(
      axiosResponse(collectionDocument([], { type: 'tag' })),
    );
    const controller = new AbortController();

    await service.findLibraryTags({ signal: controller.signal });

    expect(http.get).toHaveBeenCalledWith('library', {
      params: { brandId: undefined, search: undefined },
      signal: controller.signal,
    });
  });

  it('creates a brand tag by default, trimming the label', async () => {
    http.post.mockResolvedValue(
      axiosResponse(
        resourceDocument(
          { label: 'Spring drop', scope: TagScope.BRAND },
          { id: 'tag-3', type: 'tag' },
        ),
      ),
    );

    const tag = await service.createLibraryTag('  Spring drop ');

    expect(http.post).toHaveBeenCalledWith('', {
      label: 'Spring drop',
      scope: TagScope.BRAND,
    });
    expect(tag).toMatchObject({ id: 'tag-3', label: 'Spring drop' });
  });

  it('creates an organization-wide tag when asked to', async () => {
    http.post.mockResolvedValue(
      axiosResponse(
        resourceDocument(
          { label: 'Launch', scope: TagScope.ORGANIZATION },
          { id: 'tag-4', type: 'tag' },
        ),
      ),
    );

    await service.createLibraryTag('Launch', TagScope.ORGANIZATION);

    expect(http.post).toHaveBeenCalledWith('', {
      label: 'Launch',
      scope: TagScope.ORGANIZATION,
    });
  });
});
