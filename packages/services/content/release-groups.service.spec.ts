import {
  CredentialPlatform,
  PostFrequency,
  PostVisibility,
  ReleaseStatus,
} from '@genfeedai/contracts';
import { ReleaseGroupsService } from '@services/content/release-groups.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/interceptor.service', () => ({
  HTTPBaseService: class {
    protected instance = {
      get: vi.fn(),
      patch: vi.fn(),
      post: vi.fn(),
    };

    static getBaseServiceInstance(
      Constructor: new (token: string) => unknown,
      token: string,
    ) {
      return new Constructor(token);
    }
  },
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.genfeed.ai' },
}));

vi.mock('@services/core/json-api', () => ({
  deserializeResource: vi.fn((document) => document.data),
}));

describe('ReleaseGroupsService', () => {
  let service: ReleaseGroupsService;
  let instance: {
    get: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    service = ReleaseGroupsService.getInstance('token');
    instance = (
      service as unknown as {
        instance: typeof instance;
      }
    ).instance;
  });

  it('creates a release group on POST /', async () => {
    instance.post.mockResolvedValue({
      data: { data: { id: 'release-1', title: 'Hook' } },
    });
    const controller = new AbortController();
    const input = {
      baseContent: 'Caption',
      media: [{ assetId: 'ingredient-1', kind: 'image' }],
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

    await expect(service.create(input, controller.signal)).resolves.toEqual({
      id: 'release-1',
      title: 'Hook',
    });
    expect(instance.post).toHaveBeenCalledWith('', input, {
      signal: controller.signal,
    });
  });

  it('reads one canonical release group', async () => {
    instance.get.mockResolvedValue({ data: { data: { id: 'release-1' } } });
    const controller = new AbortController();

    await expect(
      service.getOne('release-1', controller.signal),
    ).resolves.toEqual({
      id: 'release-1',
    });
    expect(instance.get).toHaveBeenCalledWith('/release-1', {
      signal: controller.signal,
    });
  });

  it('previews recurrence without a durable write', async () => {
    const controller = new AbortController();
    instance.post.mockResolvedValue({
      data: {
        isExhausted: false,
        occurrences: ['2026-08-10T09:00:00.000Z'],
        success: true,
      },
    });

    await service.preview(
      {
        recurrence: {
          frequency: PostFrequency.WEEKLY,
          interval: 1,
          maxRepeats: 4,
          weekdays: [1],
        },
        startAt: '2026-08-03T09:00:00.000Z',
        timezone: 'UTC',
      },
      controller.signal,
    );

    expect(instance.post).toHaveBeenCalledWith(
      '/recurrence/preview',
      expect.objectContaining({ timezone: 'UTC' }),
      { signal: controller.signal },
    );
  });

  it('uses dedicated series commands for lifecycle mutations', async () => {
    instance.patch.mockResolvedValue({
      data: { data: { id: 'release-1' } },
    });

    await service.pauseFuture('release-1');
    await service.resumeFuture('release-1');
    await service.cancelFuture('release-1');

    expect(instance.patch).toHaveBeenNthCalledWith(1, '/release-1', {
      action: 'series-pause',
    });
    expect(instance.patch).toHaveBeenNthCalledWith(2, '/release-1', {
      action: 'series-resume',
    });
    expect(instance.patch).toHaveBeenNthCalledWith(3, '/release-1', {
      action: 'series-cancel-future',
    });
  });

  it('edits only future occurrence state', async () => {
    instance.patch.mockResolvedValue({
      data: { data: { id: 'release-1' } },
    });

    await service.editFuture('release-1', {
      scheduledDate: '2026-08-12T09:00:00.000Z',
    });

    expect(instance.patch).toHaveBeenCalledWith('/release-1/series/future', {
      scheduledDate: '2026-08-12T09:00:00.000Z',
    });
  });
});
