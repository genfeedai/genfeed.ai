import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExtractCollection, mockExtractResource, mockGet } = vi.hoisted(
  () => ({
    mockExtractCollection: vi.fn(),
    mockExtractResource: vi.fn(),
    mockGet: vi.fn(),
  }),
);

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.test.com' },
}));

vi.mock('@services/core/interceptor.service', () => ({
  HTTPBaseService: class MockHTTPBaseService {
    public baseURL: string;
    public instance = { get: mockGet };

    constructor(baseURL: string) {
      this.baseURL = baseURL;
    }

    static getBaseServiceInstance(Service: new (token: string) => unknown) {
      return new Service('token');
    }
  },
}));

vi.mock('@services/core/json-api', () => ({
  extractCollection: mockExtractCollection,
  extractResource: mockExtractResource,
}));

import { ReleaseGroupsService } from './release-groups.service';

describe('ReleaseGroupsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the calendar range as canonical release groups', async () => {
    const document = { data: [] };
    const releases = [{ id: 'release-1', title: 'Launch' }];
    mockGet.mockResolvedValue({ data: document });
    mockExtractCollection.mockReturnValue(releases);
    const service = new ReleaseGroupsService('token');
    const query = {
      brandId: 'brand-1',
      endDate: '2026-07-31T23:59:59.000Z',
      startDate: '2026-07-27T00:00:00.000Z',
    };

    await expect(service.findAll(query)).resolves.toEqual(releases);
    expect(mockGet).toHaveBeenCalledWith('', { params: query });
    expect(mockExtractCollection).toHaveBeenCalledWith(document);
  });

  it('loads one release with normalized target relationships', async () => {
    const document = { data: { id: 'release-1' } };
    const release = { id: 'release-1', targets: [] };
    mockGet.mockResolvedValue({ data: document });
    mockExtractResource.mockReturnValue(release);

    await expect(
      new ReleaseGroupsService('token').findOne('release-1'),
    ).resolves.toEqual(release);
    expect(mockGet).toHaveBeenCalledWith('/release-1');
    expect(mockExtractResource).toHaveBeenCalledWith(document);
  });
});
