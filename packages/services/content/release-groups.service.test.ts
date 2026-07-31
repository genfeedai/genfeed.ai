import {
  CredentialPlatform,
  ReleaseStatus,
  ReleaseTargetSource,
  TargetExecutionState,
} from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDeserializeResource,
  mockExtractCollection,
  mockExtractResource,
  mockGet,
  mockPatch,
} = vi.hoisted(() => ({
  mockDeserializeResource: vi.fn(),
  mockExtractCollection: vi.fn(),
  mockExtractResource: vi.fn(),
  mockGet: vi.fn(),
  mockPatch: vi.fn(),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.test.com' },
}));

vi.mock('@services/core/interceptor.service', () => ({
  HTTPBaseService: class MockHTTPBaseService {
    public baseURL: string;
    public instance = { get: mockGet, patch: mockPatch };

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
});
