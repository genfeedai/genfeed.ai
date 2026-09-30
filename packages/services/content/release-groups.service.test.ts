import {
  CredentialPlatform,
  PostVisibility,
  ReleaseStatus,
  ReleaseTargetSource,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDeserializeResource,
  mockExtractCollection,
  mockExtractResource,
  mockGet,
  mockPatch,
  mockPost,
} = vi.hoisted(() => ({
  mockDeserializeResource: vi.fn(),
  mockExtractCollection: vi.fn(),
  mockExtractResource: vi.fn(),
  mockGet: vi.fn(),
  mockPatch: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.test.com' },
}));

vi.mock('@services/core/interceptor.service', () => ({
  HTTPBaseService: class MockHTTPBaseService {
    public baseURL: string;
    public instance = { get: mockGet, patch: mockPatch, post: mockPost };

    constructor(baseURL: string) {
      this.baseURL = baseURL;
    }

    static getBaseServiceInstance(Service: new (token: string) => unknown) {
      return new Service('token');
    }
  },
}));

vi.mock('@services/core/json-api', () => ({
  deserializeResource: mockDeserializeResource,
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
    expect(mockGet).toHaveBeenCalledWith('', {
      params: query,
      signal: undefined,
    });
    expect(mockExtractCollection).toHaveBeenCalledWith(document);
  });

  it('forwards every calendar facet and the abort signal verbatim', async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });
    mockExtractCollection.mockReturnValue([]);
    const controller = new AbortController();
    const query = {
      brandId: 'brand-1',
      credentialId: ['credential-1', 'credential-2'],
      endDate: '2026-07-31T23:59:59.000Z',
      executionState: [TargetExecutionState.FAILED],
      platform: [CredentialPlatform.INSTAGRAM],
      source: [ReleaseTargetSource.WORKFLOW],
      startDate: '2026-07-27T00:00:00.000Z',
      status: [ReleaseStatus.SCHEDULED],
    };

    await new ReleaseGroupsService('token').findAll(query, controller.signal);

    expect(mockGet).toHaveBeenCalledWith('', {
      params: query,
      signal: controller.signal,
    });
  });

  it('preserves canonical Publish list pagination metadata', async () => {
    const document = {
      data: [],
      links: {
        pagination: { limit: 12, page: 2, pages: 4, total: 41 },
      },
    };
    const releases = [{ id: 'release-13', targets: [] }];
    mockGet.mockResolvedValue({ data: document });
    mockExtractCollection.mockReturnValue(releases);
    const query = {
      brandId: 'brand-1',
      limit: 12,
      page: 2,
      publicationState: 'posted' as const,
      sort: 'createdAt: -1' as const,
    };

    await expect(
      new ReleaseGroupsService('token').findAllPage(query),
    ).resolves.toEqual({
      hasNext: true,
      hasPrevious: true,
      items: releases,
      page: 2,
      pageSize: 12,
      total: 41,
      totalPages: 4,
    });
    expect(mockGet).toHaveBeenCalledWith('', {
      params: query,
      signal: undefined,
    });
  });

  it('loads one release with normalized target relationships', async () => {
    const document = { data: { id: 'release-1' } };
    const release = { id: 'release-1', targets: [] };
    mockGet.mockResolvedValue({ data: document });
    mockDeserializeResource.mockReturnValue(release);

    await expect(
      new ReleaseGroupsService('token').findOne('release-1'),
    ).resolves.toEqual(release);
    expect(mockGet).toHaveBeenCalledWith('/release-1', {
      signal: undefined,
    });
    expect(mockDeserializeResource).toHaveBeenCalledWith(document);
  });

  it('moves calendar placement through the calendar-move action', async () => {
    const document = { data: { id: 'release-1' } };
    const release = {
      id: 'release-1',
      scheduledAt: '2026-08-02T09:00:00.000Z',
    };
    mockPatch.mockResolvedValue({ data: document });
    mockDeserializeResource.mockReturnValue(release);

    await expect(
      new ReleaseGroupsService('token').moveCalendarPlacement(
        'release-1',
        '2026-08-02T09:00:00.000Z',
      ),
    ).resolves.toEqual(release);
    expect(mockPatch).toHaveBeenCalledWith('/release-1', {
      action: 'calendar-move',
      scheduledDate: '2026-08-02T09:00:00.000Z',
    });
  });

  it('republishes through the republish action', async () => {
    const document = { data: { id: 'release-2' } };
    const release = {
      id: 'release-2',
      scheduledAt: '2026-08-02T11:00:00.000Z',
    };
    mockPatch.mockResolvedValue({ data: document });
    mockDeserializeResource.mockReturnValue(release);

    await expect(
      new ReleaseGroupsService('token').republishAt(
        'release-1',
        '2026-08-02T11:00:00.000Z',
      ),
    ).resolves.toEqual(release);
    expect(mockPatch).toHaveBeenCalledWith('/release-1', {
      action: 'republish',
      scheduledDate: '2026-08-02T11:00:00.000Z',
    });
  });

  it('reschedules a release through the release-level patch endpoint', async () => {
    const document = { data: { id: 'release-1' } };
    const release = {
      id: 'release-1',
      scheduledAt: '2026-08-02T09:00:00.000Z',
    };
    mockPatch.mockResolvedValue({ data: document });
    mockDeserializeResource.mockReturnValue(release);

    await expect(
      new ReleaseGroupsService('token').update('release-1', {
        scheduledDate: '2026-08-02T09:00:00.000Z',
      }),
    ).resolves.toEqual(release);
    expect(mockPatch).toHaveBeenCalledWith('/release-1', {
      scheduledDate: '2026-08-02T09:00:00.000Z',
    });
    expect(mockDeserializeResource).toHaveBeenCalledWith(document);
  });

  it('reschedules one channel target through the nested target endpoint', async () => {
    const document = { data: { id: 'release-1' } };
    mockPatch.mockResolvedValue({ data: document });
    mockDeserializeResource.mockReturnValue({ id: 'release-1' });

    await new ReleaseGroupsService('token').updateTarget(
      'release-1',
      'target-9',
      { scheduledDate: '2026-08-02T11:00:00.000Z' },
    );

    expect(mockPatch).toHaveBeenCalledWith('/release-1/targets/target-9', {
      scheduledDate: '2026-08-02T11:00:00.000Z',
    });
  });

  it('expresses a manual retry as a transition back to scheduled', async () => {
    mockPatch.mockResolvedValue({ data: { data: { id: 'release-1' } } });
    mockDeserializeResource.mockReturnValue({ id: 'release-1' });

    await new ReleaseGroupsService('token').updateTarget(
      'release-1',
      'target-9',
      { executionState: TargetExecutionState.SCHEDULED },
    );

    expect(mockPatch).toHaveBeenCalledWith('/release-1/targets/target-9', {
      executionState: TargetExecutionState.SCHEDULED,
    });
  });

  it('publishes a TikTok target through the native app handoff action', async () => {
    const document = { data: { id: 'release-1' } };
    mockPatch.mockResolvedValue({ data: document });
    mockDeserializeResource.mockReturnValue({ id: 'release-1' });

    await new ReleaseGroupsService('token').publishTargetViaTikTokApp(
      'release-1',
      'target-9',
    );

    expect(mockPatch).toHaveBeenCalledWith('/release-1/targets/target-9', {
      action: 'publish-via-tiktok-app',
    });
    expect(mockDeserializeResource).toHaveBeenCalledWith(document);
  });

  it('creates a release group through POST /', async () => {
    const document = { data: { id: 'release-1' } };
    const release = { id: 'release-1', title: 'Hook' };
    mockPost.mockResolvedValue({ data: document });
    mockDeserializeResource.mockReturnValue(release);
    const input = {
      baseContent: 'Caption',
      status: ReleaseStatus.DRAFT,
      targets: [
        {
          credentialId: 'cred-1',
          order: 0,
          platform: CredentialPlatform.TIKTOK,
          visibility: PostVisibility.PUBLIC,
        },
      ],
      timezone: 'UTC',
      title: 'Hook',
    };

    await expect(
      new ReleaseGroupsService('token').create(input),
    ).resolves.toEqual(release);
    expect(mockPost).toHaveBeenCalledWith('', input, { signal: undefined });
    expect(mockDeserializeResource).toHaveBeenCalledWith(document);
  });
});
