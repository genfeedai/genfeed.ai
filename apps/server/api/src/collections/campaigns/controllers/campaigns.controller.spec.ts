import { CampaignsController } from '@api/collections/campaigns/controllers/campaigns.controller';
import { CampaignsService } from '@api/collections/campaigns/services/campaigns.service';
import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { ApiKeyScope, ContentCampaignStatus } from '@genfeedai/enums';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
}));

const MUTATION_SCOPES = [
  ApiKeyScope.POSTS_DRAFT,
  ApiKeyScope.POSTS_CREATE,
  ApiKeyScope.POSTS_SCHEDULE,
];

const CAMPAIGN_ID = 'ccampaign0001';
const request = { originalUrl: '/campaigns' } as never;
const user = {
  brandId: 'cbrand0000001',
  id: 'session-id',
  organizationId: 'org-1',
  userId: 'legacy-base62-user-id',
} as never;

describe('CampaignsController', () => {
  const service = {
    archive: vi.fn(),
    assignPosts: vi.fn(),
    create: vi.fn(),
    getOne: vi.fn(),
    list: vi.fn(),
    remove: vi.fn(),
    restore: vi.fn(),
    unassignPosts: vi.fn(),
    update: vi.fn(),
  };
  let controller: CampaignsController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new CampaignsController(
      service as unknown as CampaignsService,
    );
  });

  it('wires the collection routes onto the campaigns service', async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CampaignsController],
      providers: [{ provide: CampaignsService, useValue: service }],
    }).compile();

    expect(module.get(CampaignsController)).toBeDefined();
  });

  it('scopes the list to the caller organization', async () => {
    service.list.mockResolvedValue({ docs: [] });

    await controller.list(request, user, {
      limit: 10,
      page: 1,
      status: ContentCampaignStatus.ACTIVE,
    } as never);

    expect(service.list).toHaveBeenCalledWith('org-1', {
      limit: 10,
      page: 1,
      status: ContentCampaignStatus.ACTIVE,
    });
  });

  it('stamps the canonical opaque user id on create', async () => {
    service.create.mockResolvedValue({ id: CAMPAIGN_ID });

    await controller.create(request, user, {
      brandId: 'cbrand0000001',
      name: 'Q4 launch',
    } as never);

    expect(service.create).toHaveBeenCalledWith(
      'org-1',
      'legacy-base62-user-id',
      { brandId: 'cbrand0000001', name: 'Q4 launch' },
    );
  });

  it('keeps post assignment array-shaped in both directions', async () => {
    service.assignPosts.mockResolvedValue({ id: CAMPAIGN_ID });
    service.unassignPosts.mockResolvedValue({ id: CAMPAIGN_ID });

    const dto = { postIds: ['cpost00000001', 'cpost00000002'] };
    await controller.assignPosts(request, user, CAMPAIGN_ID, dto);
    await controller.unassignPosts(request, user, CAMPAIGN_ID, dto);

    expect(service.assignPosts).toHaveBeenCalledWith('org-1', CAMPAIGN_ID, dto);
    expect(service.unassignPosts).toHaveBeenCalledWith(
      'org-1',
      CAMPAIGN_ID,
      dto,
    );
  });

  it('passes an explicit restore status through', async () => {
    service.restore.mockResolvedValue({ id: CAMPAIGN_ID });

    await controller.restore(request, user, CAMPAIGN_ID, {
      status: ContentCampaignStatus.ACTIVE,
    });

    expect(service.restore).toHaveBeenCalledWith(
      'org-1',
      CAMPAIGN_ID,
      ContentCampaignStatus.ACTIVE,
    );
  });

  it('declares fail-closed publishing scopes on mutation routes', () => {
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        CampaignsController.prototype.create,
      ),
    ).toEqual(MUTATION_SCOPES);
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        CampaignsController.prototype.update,
      ),
    ).toEqual(MUTATION_SCOPES);
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        CampaignsController.prototype.archive,
      ),
    ).toEqual(MUTATION_SCOPES);
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        CampaignsController.prototype.restore,
      ),
    ).toEqual(MUTATION_SCOPES);
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        CampaignsController.prototype.assignPosts,
      ),
    ).toEqual(MUTATION_SCOPES);
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        CampaignsController.prototype.unassignPosts,
      ),
    ).toEqual(MUTATION_SCOPES);
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        CampaignsController.prototype.remove,
      ),
    ).toEqual(MUTATION_SCOPES);
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        CampaignsController.prototype.list,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        CampaignsController.prototype.getOne,
      ),
    ).toBeUndefined();
  });
});
