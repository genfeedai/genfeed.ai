import { RssSourcesController } from '@api/collections/rss-sources/controllers/rss-sources.controller';
import type { RssSourceWorkflowService } from '@api/collections/rss-sources/services/rss-source-workflow.service';
import type { RssSourcesService } from '@api/collections/rss-sources/services/rss-sources.service';
import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { ApiKeyScope } from '@genfeedai/contracts';
import { ForbiddenException } from '@nestjs/common';

const MUTATION_SCOPES = [
  ApiKeyScope.POSTS_DRAFT,
  ApiKeyScope.POSTS_CREATE,
  ApiKeyScope.POSTS_SCHEDULE,
];

vi.mock('@genfeedai/serializers', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@genfeedai/serializers')>();
  return {
    ...actual,
    RssSourceSerializer: { serialize: vi.fn() },
  };
});

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
}));

describe('RssSourcesController', () => {
  const request = {} as never;
  const user = {
    brandId: 'brand-1',
    id: 'user-1',
    isSuperAdmin: false,
    organizationId: 'org-1',
    userId: 'user-1',
  } as never;
  const service = {
    createScoped: vi.fn(),
    findAllScoped: vi.fn(),
    findOneScoped: vi.fn(),
    removeScoped: vi.fn(),
    updateScoped: vi.fn(),
  };
  const rssSourceWorkflowService = {
    enqueueSource: vi.fn(),
  };
  const controller = new RssSourcesController(
    service as unknown as RssSourcesService,
    rssSourceWorkflowService as unknown as RssSourceWorkflowService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stamps tenant scope onto create', async () => {
    const body = {
      feedUrl: 'https://example.com/feed.xml',
      label: 'Industry feed',
      targetChannels: [{ credentialId: 'cred_x', platform: 'twitter' }],
    };
    service.createScoped.mockResolvedValue({ id: 'rss-1' });

    await controller.create(request, user, body as never);

    expect(service.createScoped).toHaveBeenCalledWith(body, {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });

  it('rejects a cross-tenant organization override before mutation', async () => {
    await expect(
      controller.update(
        request,
        user,
        { organizationId: 'org-2' } as never,
        'rss-1',
        { label: 'Hijacked' } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(service.updateScoped).not.toHaveBeenCalled();
  });

  it('declares posting write scopes on every mutation and poll route', () => {
    for (const handler of [
      RssSourcesController.prototype.create,
      RssSourcesController.prototype.update,
      RssSourcesController.prototype.remove,
      RssSourcesController.prototype.poll,
    ]) {
      expect(Reflect.getMetadata(API_KEY_SCOPES_KEY, handler)).toEqual(
        MUTATION_SCOPES,
      );
    }
  });

  it('passes tenant scope through read, update, remove, and poll', async () => {
    const query = { brandId: 'brand-1' } as never;
    service.findOneScoped.mockResolvedValue({ id: 'rss-1' });
    service.updateScoped.mockResolvedValue({ id: 'rss-1' });
    rssSourceWorkflowService.enqueueSource.mockResolvedValue('job-1');

    await controller.findOne(request, user, query, 'rss-1');
    await controller.update(request, user, query, 'rss-1', {
      label: 'Updated',
    } as never);
    await controller.remove(user, query, 'rss-1');
    await controller.poll(user, query, 'rss-1');

    expect(service.findOneScoped).toHaveBeenCalledWith('rss-1', {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(service.updateScoped).toHaveBeenCalledWith(
      'rss-1',
      { label: 'Updated' },
      {
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      },
    );
    expect(service.removeScoped).toHaveBeenCalledWith('rss-1', {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });
    // Manual poll no longer runs inline — it queues the RSS source workflow.
    expect(rssSourceWorkflowService.enqueueSource).toHaveBeenCalledWith({
      brandId: 'brand-1',
      organizationId: 'org-1',
      sourceId: 'rss-1',
      userId: 'user-1',
    });
  });
});
