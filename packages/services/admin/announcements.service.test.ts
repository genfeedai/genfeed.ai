import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { AdminAnnouncementsService } from '@services/admin/announcements.service';

import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AdminAnnouncementsService', () => {
  let service: AdminAnnouncementsService;
  let http: MockHttpInstance;
  beforeEach(() => {
    vi.clearAllMocks();
    service = new AdminAnnouncementsService('test-token');
    http = installMockHttp(service);
  });
  it('deserializes announcement history collections with fallback metadata', async () => {
    http.get.mockResolvedValue(
      axiosResponse(
        collectionDocument([
          {
            id: 'announcement-1',
            body: 'Release note',
            createdAt: '2026-03-09',
          },
        ]),
      ),
    );
    await expect(service.getAnnouncements()).resolves.toMatchObject({
      items: [
        { id: 'announcement-1', body: 'Release note', createdAt: '2026-03-09' },
      ],
      total: 1,
      totalPages: 1,
    });
  });
  it('returns its page metadata and forwards cancellation', async () => {
    http.get.mockResolvedValue(
      axiosResponse(
        collectionDocument([], {
          pagination: { limit: 10, page: 3, pages: 5, total: 42 },
        }),
      ),
    );
    const signal = new AbortController().signal;
    const result = await service.getAnnouncements(
      { limit: 10, page: 3 },
      signal,
    );
    expect(http.get).toHaveBeenCalledWith('', {
      params: { limit: 10, page: 3 },
      signal,
    });
    expect(result).toMatchObject({
      items: [],
      page: 3,
      total: 42,
      totalPages: 5,
    });
  });
  it('deserializes announcement broadcasts as resources', async () => {
    http.post.mockResolvedValue(
      axiosResponse(
        resourceDocument(
          { body: 'New launch', createdAt: '2026-03-09' },
          { id: 'announcement-2' },
        ),
      ),
    );
    await expect(
      service.broadcast({ body: 'New launch', channels: { discord: true } }),
    ).resolves.toMatchObject({
      body: 'New launch',
      createdAt: '2026-03-09',
      id: 'announcement-2',
    });
  });
});
