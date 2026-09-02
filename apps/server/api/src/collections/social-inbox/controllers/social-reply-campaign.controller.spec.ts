import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { SocialReplyCampaignController } from '@api/collections/social-inbox/controllers/social-reply-campaign.controller';
import { SocialReplyCampaignService } from '@api/collections/social-inbox/services/social-reply-campaign.service';
import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ApiKeyScope } from '@genfeedai/contracts';
import { UnauthorizedException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_request, _serializer, data) => data),
  serializeSingle: vi.fn((_request, _serializer, data) => data),
}));

const REQUEST = { originalUrl: '/message-campaigns' } as unknown as Request;

const USER = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
} as unknown as User;

const SCOPE = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
};

describe('SocialReplyCampaignController', () => {
  let controller: SocialReplyCampaignController;
  let campaignService: {
    create: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    listRecipients: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    transition: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    campaignService = {
      create: vi.fn().mockResolvedValue({ id: 'campaign-1' }),
      get: vi.fn().mockResolvedValue({ id: 'campaign-1' }),
      list: vi.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
      listRecipients: vi
        .fn()
        .mockResolvedValue({ data: [], meta: { total: 0 } }),
      patch: vi.fn().mockResolvedValue({ id: 'campaign-1' }),
      remove: vi.fn().mockResolvedValue({ id: 'campaign-1' }),
      transition: vi.fn().mockResolvedValue({ id: 'campaign-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SocialReplyCampaignController],
      providers: [
        { provide: SocialReplyCampaignService, useValue: campaignService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(SocialReplyCampaignController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('routing', () => {
    it('lives on its own top-level path so /messages/:conversationId cannot swallow it', () => {
      expect(Reflect.getMetadata('path', SocialReplyCampaignController)).toBe(
        'message-campaigns',
      );
    });
  });

  describe('delegation', () => {
    it('passes the derived tenant scope and query through to the service', async () => {
      const query = { platform: 'youtube', status: 'running' };

      await controller.list(REQUEST, USER, query as never);

      expect(campaignService.list).toHaveBeenCalledWith(SCOPE, query);
    });

    it('creates a campaign from the validated body', async () => {
      const body = {
        bodyTemplate: 'Hi {{name}}',
        conversationIds: ['conversation-1'],
        name: 'Welcome wave',
        platform: 'youtube',
      };

      await controller.create(REQUEST, USER, body as never);

      expect(campaignService.create).toHaveBeenCalledWith(SCOPE, body);
    });

    it('reads one campaign and its recipients under the same scope', async () => {
      const query = { limit: 25 };

      await controller.get(REQUEST, USER, 'campaign-1');
      await controller.listRecipients(
        REQUEST,
        USER,
        'campaign-1',
        query as never,
      );

      expect(campaignService.get).toHaveBeenCalledWith(SCOPE, 'campaign-1');
      expect(campaignService.listRecipients).toHaveBeenCalledWith(
        SCOPE,
        'campaign-1',
        query,
      );
    });

    it('unwraps the transition off the status body', async () => {
      await controller.transition(REQUEST, USER, 'campaign-1', {
        transition: 'pause',
      } as never);

      expect(campaignService.transition).toHaveBeenCalledWith(
        SCOPE,
        'campaign-1',
        'pause',
      );
    });

    it('patches copy and rate limits', async () => {
      const body = { maxPerHour: 4 };

      await controller.patch(REQUEST, USER, 'campaign-1', body as never);

      expect(campaignService.patch).toHaveBeenCalledWith(
        SCOPE,
        'campaign-1',
        body,
      );
    });

    it('removes a campaign', async () => {
      await controller.remove(REQUEST, USER, 'campaign-1');

      expect(campaignService.remove).toHaveBeenCalledWith(SCOPE, 'campaign-1');
    });
  });

  describe('scope derivation', () => {
    it('rejects a session with no organization instead of querying unscoped', async () => {
      const orgless = { userId: 'user-1' } as unknown as User;

      await expect(
        controller.list(REQUEST, orgless, {} as never),
      ).rejects.toThrow(UnauthorizedException);
      expect(campaignService.list).not.toHaveBeenCalled();
    });
  });

  describe('RBAC', () => {
    it('lets any member read campaigns and recipients', () => {
      expect(
        Reflect.getMetadata(
          'roles',
          SocialReplyCampaignController.prototype.list,
        ),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(
          'roles',
          SocialReplyCampaignController.prototype.get,
        ),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(
          'roles',
          SocialReplyCampaignController.prototype.listRecipients,
        ),
      ).toBeUndefined();
    });

    it('lets creators author campaigns but not run them', () => {
      expect(
        Reflect.getMetadata(
          'roles',
          SocialReplyCampaignController.prototype.create,
        ),
      ).toEqual(['owner', 'admin', 'creator']);
      expect(
        Reflect.getMetadata(
          'roles',
          SocialReplyCampaignController.prototype.patch,
        ),
      ).toEqual(['owner', 'admin', 'creator']);
      expect(
        Reflect.getMetadata(
          'roles',
          SocialReplyCampaignController.prototype.transition,
        ),
      ).toEqual(['owner', 'admin']);
      expect(
        Reflect.getMetadata(
          'roles',
          SocialReplyCampaignController.prototype.remove,
        ),
      ).toEqual(['owner', 'admin']);
    });

    it('gates the API key on drafting to author and on publishing to start', () => {
      expect(
        Reflect.getMetadata(
          API_KEY_SCOPES_KEY,
          SocialReplyCampaignController.prototype.create,
        ),
      ).toEqual([ApiKeyScope.POSTS_DRAFT, ApiKeyScope.POSTS_CREATE]);
      expect(
        Reflect.getMetadata(
          API_KEY_SCOPES_KEY,
          SocialReplyCampaignController.prototype.transition,
        ),
      ).toEqual([ApiKeyScope.POSTS_PUBLISH]);
    });
  });
});
