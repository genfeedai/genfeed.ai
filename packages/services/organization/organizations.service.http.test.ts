import { IngredientCategory, OrganizationCategory } from '@genfeedai/contracts';
import type { IMemberInvitation } from '@genfeedai/contracts/interfaces';
import { Avatar } from '@genfeedai/models/ai/avatar.model';
import { Ingredient } from '@genfeedai/models/content/ingredient.model';
import { Image } from '@genfeedai/models/ingredients/image.model';
import { Music } from '@genfeedai/models/ingredients/music.model';
import { Video } from '@genfeedai/models/ingredients/video.model';
import { Voice } from '@genfeedai/models/ingredients/voice.model';
import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { PagesService } from '@services/content/pages.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('OrganizationsService HTTP methods', () => {
  const orgId = 'org_1';
  let service: OrganizationsService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.restoreAllMocks();
    service = new OrganizationsService('org-token');
    http = installMockHttp(service);
  });

  describe('relationship collections', () => {
    it('findOrganizationBrands GETs /brands scoped to the organization', async () => {
      http.get.mockResolvedValue(
        axiosResponse(collectionDocument([{ id: 'brand_1', label: 'Brand' }])),
      );

      const result = await service.findOrganizationBrands(orgId, { page: 2 });

      expect(http.get).toHaveBeenCalledWith(
        expect.stringContaining('/brands'),
        { params: { organizationId: orgId, page: 2 } },
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('brand_1');
    });

    it('findOrganizationBrands records pagination when page is requested', async () => {
      const setCurrentPage = vi.spyOn(PagesService, 'setCurrentPage');
      const setTotalPages = vi.spyOn(PagesService, 'setTotalPages');
      http.get.mockResolvedValue(
        axiosResponse(
          collectionDocument([], {
            pagination: { limit: 10, page: 3, pages: 7, total: 65 },
          }),
        ),
      );

      await service.findOrganizationBrands(orgId, { page: 3 });

      expect(setCurrentPage).toHaveBeenCalledWith(3);
      expect(setTotalPages).toHaveBeenCalledWith(7);
    });

    it('findOrganizationMembers GETs the members relationship route', async () => {
      http.get.mockResolvedValue(
        axiosResponse(
          collectionDocument([{ id: 'member_1', roleKey: 'admin' }]),
        ),
      );

      const result = await service.findOrganizationMembers(orgId, {
        limit: 5,
      });

      expect(http.get).toHaveBeenCalledWith(`/${orgId}/members`, {
        params: { limit: 5 },
      });
      expect(result[0].id).toBe('member_1');
    });

    it('findOrganizationTags GETs /tags scoped to the organization', async () => {
      http.get.mockResolvedValue(
        axiosResponse(collectionDocument([{ id: 'tag_1', label: 'Tag' }])),
      );

      const result = await service.findOrganizationTags(orgId);

      expect(http.get).toHaveBeenCalledWith(expect.stringContaining('/tags'), {
        params: { organizationId: orgId },
      });
      expect(result[0].id).toBe('tag_1');
    });

    it('findOrganizationActivities GETs /activities scoped to the organization', async () => {
      const setCurrentPage = vi.spyOn(PagesService, 'setCurrentPage');
      http.get.mockResolvedValue(
        axiosResponse(
          collectionDocument([{ id: 'activity_1', key: 'post.created' }], {
            pagination: { limit: 10, page: 1, pages: 2, total: 12 },
          }),
        ),
      );

      const result = await service.findOrganizationActivities(orgId, {
        page: 1,
      });

      expect(http.get).toHaveBeenCalledWith(
        expect.stringContaining('/activities'),
        { params: { organizationId: orgId, page: 1 } },
      );
      expect(setCurrentPage).toHaveBeenCalledWith(1);
      expect(result[0].id).toBe('activity_1');
    });
  });

  describe('findOrganizationIngredients', () => {
    it('maps each item to its category-specific model', async () => {
      http.get.mockResolvedValue(
        axiosResponse(
          collectionDocument([
            { category: IngredientCategory.VIDEO, id: 'ing_1' },
            { category: IngredientCategory.IMAGE, id: 'ing_2' },
            { category: IngredientCategory.MUSIC, id: 'ing_3' },
            { category: IngredientCategory.VOICE, id: 'ing_4' },
            { category: IngredientCategory.AVATAR, id: 'ing_5' },
            { category: 'mystery', id: 'ing_6' },
            { id: 'ing_7', label: 'No category' },
          ]),
        ),
      );

      const result = await service.findOrganizationIngredients(orgId);

      expect(http.get).toHaveBeenCalledWith(`/${orgId}/ingredients`, {
        params: undefined,
      });
      expect(result[0]).toBeInstanceOf(Video);
      expect(result[1]).toBeInstanceOf(Image);
      expect(result[2]).toBeInstanceOf(Music);
      expect(result[3]).toBeInstanceOf(Voice);
      expect(result[4]).toBeInstanceOf(Avatar);
      expect(result[5]).toBeInstanceOf(Ingredient);
      // No category falls back to the VIDEO default
      expect(result[6]).toBeInstanceOf(Video);
    });

    it('records pagination when page is requested', async () => {
      const setCurrentPage = vi.spyOn(PagesService, 'setCurrentPage');
      const setTotalPages = vi.spyOn(PagesService, 'setTotalPages');
      http.get.mockResolvedValue(
        axiosResponse(
          collectionDocument([], {
            pagination: { limit: 10, page: 2, pages: 4, total: 31 },
          }),
        ),
      );

      await service.findOrganizationIngredients(orgId, { page: 2 });

      expect(setCurrentPage).toHaveBeenCalledWith(2);
      expect(setTotalPages).toHaveBeenCalledWith(4);
    });
  });

  describe('subscription and settings', () => {
    it('findOrganizationSubscription returns null when no data', async () => {
      http.get.mockResolvedValue(axiosResponse({}));

      const result = await service.findOrganizationSubscription(orgId);

      expect(http.get).toHaveBeenCalledWith(`/${orgId}/subscription`);
      expect(result).toBeNull();
    });

    it('findOrganizationSubscription extracts the resource', async () => {
      http.get.mockResolvedValue(
        axiosResponse(resourceDocument({ plan: 'pro' }, { id: 'sub_1' })),
      );

      const result = await service.findOrganizationSubscription(orgId);

      expect(result).toMatchObject({ id: 'sub_1', plan: 'pro' });
    });

    it('getSettings GETs the settings resource', async () => {
      http.get.mockResolvedValue(
        axiosResponse(
          resourceDocument({ enabledModelIds: ['m1'] }, { id: 'settings_1' }),
        ),
      );

      const result = await service.getSettings(orgId);

      expect(http.get).toHaveBeenCalledWith(`/${orgId}/settings`);
      expect(result.enabledModelIds).toEqual(['m1']);
    });

    it('patchSettings serializes and PATCHes the settings', async () => {
      http.patch.mockResolvedValue(
        axiosResponse(
          resourceDocument({ enabledModelIds: ['m2'] }, { id: 'settings_1' }),
        ),
      );

      const result = await service.patchSettings(orgId, {
        enabledModelIds: ['m2'],
      });

      expect(http.patch).toHaveBeenCalledWith(`/${orgId}/settings`, {
        enabledModelIds: ['m2'],
      });
      expect(result.enabledModelIds).toEqual(['m2']);
    });

    it('testWebhookDelivery POSTs to the webhook test endpoint', async () => {
      http.post.mockResolvedValue(
        axiosResponse({ data: { isDelivered: true } }),
      );

      const result = await service.testWebhookDelivery(orgId, {
        event: 'post.published',
      });

      expect(http.post).toHaveBeenCalledWith(
        `/${orgId}/settings/webhooks/test`,
        { event: 'post.published' },
      );
      expect(result).toEqual({ isDelivered: true });
    });
  });

  describe('organization mutations', () => {
    it('updateAccountType PATCHes accountType and legacy category', async () => {
      http.patch.mockResolvedValue(
        axiosResponse(resourceDocument({ label: 'Org' }, { id: orgId })),
      );

      const result = await service.updateAccountType(
        orgId,
        OrganizationCategory.BUSINESS,
      );

      expect(http.patch).toHaveBeenCalledWith(`/${orgId}`, {
        accountType: OrganizationCategory.BUSINESS,
        category: OrganizationCategory.BUSINESS,
      });
      expect(result.id).toBe(orgId);
    });

    it('getFleetCapabilities GETs the brand fleet capabilities', async () => {
      http.get.mockResolvedValue(
        axiosResponse(resourceDocument({ hasFleet: true }, { id: 'cap_1' })),
      );

      const result = await service.getFleetCapabilities(orgId, 'brand_1');

      expect(http.get).toHaveBeenCalledWith(
        `/${orgId}/brands/brand_1/fleet-capabilities`,
      );
      expect(result).toMatchObject({ hasFleet: true });
    });

    it('inviteMember serializes and POSTs the invitation', async () => {
      http.post.mockResolvedValue(
        axiosResponse(
          resourceDocument(
            { email: 'new@member.dev', roleKey: 'admin', status: 'delivered' },
            { id: 'invitation_1' },
          ),
        ),
      );
      const invitation = {
        email: 'new@member.dev',
        role: 'admin',
      } as unknown as IMemberInvitation;

      const result = await service.inviteMember(orgId, invitation);

      expect(http.post).toHaveBeenCalledWith(`/${orgId}/members`, invitation);
      expect(result).toMatchObject({
        email: 'new@member.dev',
        id: 'invitation_1',
        roleKey: 'admin',
        status: 'delivered',
      });
    });

    it('updateOrganizationMember PATCHes the member', async () => {
      http.patch.mockResolvedValue(
        axiosResponse(resourceDocument({ role: 'editor' }, { id: 'member_2' })),
      );

      const result = await service.updateOrganizationMember(orgId, 'member_2', {
        role: 'editor',
      });

      expect(http.patch).toHaveBeenCalledWith(`/${orgId}/members/member_2`, {
        role: 'editor',
      });
      expect(result.id).toBe('member_2');
    });

    it('switchOrganization PATCHes /:orgId/activate', async () => {
      const payload = {
        brand: { id: 'brand_1', label: 'Brand' },
        organization: { id: orgId, label: 'Org' },
      };
      http.patch.mockResolvedValue(axiosResponse(payload));

      const result = await service.switchOrganization(orgId);

      expect(http.patch).toHaveBeenCalledWith(`/${orgId}/activate`);
      expect(http.post).not.toHaveBeenCalledWith(`/switch/${orgId}`);
      expect(result).toEqual(payload);
    });

    it('createOrganization POSTs the payload to the collection root', async () => {
      const payload = {
        brand: { id: 'brand_2', label: 'Brand' },
        organization: { id: 'org_2', label: 'New org' },
      };
      http.post.mockResolvedValue(axiosResponse(payload));

      const result = await service.createOrganization({
        description: 'desc',
        label: 'New org',
      });

      expect(http.post).toHaveBeenCalledWith('', {
        description: 'desc',
        label: 'New org',
      });
      expect(result).toEqual(payload);
    });

    it('findBySlug GETs /by-slug/:slug', async () => {
      http.get.mockResolvedValue(
        axiosResponse(resourceDocument({ slug: 'acme' }, { id: orgId })),
      );

      const result = await service.findBySlug('acme');

      expect(http.get).toHaveBeenCalledWith('/by-slug/acme');
      expect(result.slug).toBe('acme');
    });
  });

  describe('posts and analytics', () => {
    it('findOrganizationPosts records pagination and returns items', async () => {
      const setCurrentPage = vi.spyOn(PagesService, 'setCurrentPage');
      const setTotalPages = vi.spyOn(PagesService, 'setTotalPages');
      const setTotalDocs = vi.spyOn(PagesService, 'setTotalDocs');
      http.get.mockResolvedValue(
        axiosResponse(
          collectionDocument([{ id: 'post_1' }], {
            pagination: { limit: 10, page: 2, pages: 5, total: 42 },
          }),
        ),
      );

      const result = await service.findOrganizationPosts(orgId, { page: 2 });

      expect(result).toHaveLength(1);
      expect(setCurrentPage).toHaveBeenCalledWith(2);
      expect(setTotalPages).toHaveBeenCalledWith(5);
      expect(setTotalDocs).toHaveBeenCalledWith(42);
    });

    it('findOrganizationPostsPage falls back to defaults without pagination links', async () => {
      http.get.mockResolvedValue(
        axiosResponse(collectionDocument([{ id: 'post_1' }])),
      );

      const page = await service.findOrganizationPostsPage(orgId);

      expect(page).toMatchObject({
        hasNext: false,
        hasPrevious: false,
        page: 1,
        pageSize: 1,
        total: 1,
        totalPages: 1,
      });
    });

    it('findOrganizationAnalytics GETs the analytics resource', async () => {
      http.get.mockResolvedValue(
        axiosResponse(resourceDocument({ views: 10 }, { id: 'analytics_1' })),
      );

      const result = await service.findOrganizationAnalytics(orgId, {
        timeframe: '30d',
      });

      expect(http.get).toHaveBeenCalledWith(`/${orgId}/analytics`, {
        params: { timeframe: '30d' },
      });
      expect(result).toMatchObject({ views: 10 });
    });

    it('findOrganizationAnalyticsTimeSeries GETs the timeseries collection', async () => {
      http.get.mockResolvedValue(
        axiosResponse(collectionDocument([{ id: 'point_1', views: 5 }])),
      );

      const result = await service.findOrganizationAnalyticsTimeSeries(orgId, {
        endDate: '2026-02-01',
        groupBy: 'day',
        startDate: '2026-01-01',
      });

      expect(http.get).toHaveBeenCalledWith(`/${orgId}/analytics/timeseries`, {
        params: {
          endDate: '2026-02-01',
          groupBy: 'day',
          startDate: '2026-01-01',
        },
      });
      expect(result).toEqual([{ id: 'point_1', views: 5 }]);
    });

    it('findOrganizationAnalyticsPlatforms GETs the platforms collection', async () => {
      http.get.mockResolvedValue(
        axiosResponse(collectionDocument([{ id: 'p_1' }])),
      );

      const result = await service.findOrganizationAnalyticsPlatforms(orgId);

      expect(http.get).toHaveBeenCalledWith(`/${orgId}/analytics/platforms`, {
        params: undefined,
      });
      expect(result).toEqual([{ id: 'p_1' }]);
    });

    it('findOrganizationAnalyticsTopContent GETs the top-content collection', async () => {
      http.get.mockResolvedValue(
        axiosResponse(collectionDocument([{ id: 'c_1' }])),
      );

      const result = await service.findOrganizationAnalyticsTopContent(orgId, {
        limit: 3,
      });

      expect(http.get).toHaveBeenCalledWith(`/${orgId}/analytics/top-content`, {
        params: { limit: 3 },
      });
      expect(result).toEqual([{ id: 'c_1' }]);
    });
  });

  describe('BYOK provider keys', () => {
    it('getByokAllProviders GETs the byok settings', async () => {
      http.get.mockResolvedValue(axiosResponse([{ provider: 'openai' }]));

      const result = await service.getByokAllProviders(orgId);

      expect(http.get).toHaveBeenCalledWith(`/${orgId}/settings/byok`);
      expect(result).toEqual([{ provider: 'openai' }]);
    });

    it('getByokProviderStatus GETs a single provider', async () => {
      http.get.mockResolvedValue(
        axiosResponse({ isConfigured: true, provider: 'openai' }),
      );

      const result = await service.getByokProviderStatus(orgId, 'openai');

      expect(http.get).toHaveBeenCalledWith(`/${orgId}/settings/byok/openai`);
      expect(result).toEqual({ isConfigured: true, provider: 'openai' });
    });

    it('validateByokProviderKey POSTs key material', async () => {
      http.post.mockResolvedValue(axiosResponse({ isValid: true }));

      const result = await service.validateByokProviderKey(
        orgId,
        'openai',
        'sk-key',
        'secret',
      );

      expect(http.post).toHaveBeenCalledWith(
        `/${orgId}/settings/byok/openai/validate`,
        { apiKey: 'sk-key', apiSecret: 'secret' },
      );
      expect(result).toEqual({ isValid: true });
    });

    it('saveByokProviderKey PUTs the key and refreshes topbar balances', async () => {
      const dispatchEvent = vi.fn();
      vi.stubGlobal('window', { dispatchEvent });
      http.put.mockResolvedValue(axiosResponse(undefined));

      await service.saveByokProviderKey(orgId, 'openai', 'sk-key');

      expect(http.put).toHaveBeenCalledWith(`/${orgId}/settings/byok/openai`, {
        apiKey: 'sk-key',
        apiSecret: undefined,
      });
      expect(dispatchEvent).toHaveBeenCalledTimes(1);
      expect(dispatchEvent.mock.calls[0][0].type).toBe(
        'genfeed:topbar-balances:refresh',
      );
      vi.unstubAllGlobals();
    });

    it('removeByokProviderKey DELETEs the key without a browser window', async () => {
      http.delete.mockResolvedValue(axiosResponse(undefined));

      await expect(
        service.removeByokProviderKey(orgId, 'openai'),
      ).resolves.toBeUndefined();

      expect(http.delete).toHaveBeenCalledWith(
        `/${orgId}/settings/byok/openai`,
      );
    });
  });

  describe('toggleModel', () => {
    function mockSettings(enabledModelIds: string[] | undefined): void {
      http.get.mockResolvedValue(
        axiosResponse(
          resourceDocument({ enabledModelIds }, { id: 'settings_1' }),
        ),
      );
    }

    it('adds a model that is not yet enabled', async () => {
      mockSettings(['m1']);
      http.patch.mockResolvedValue(
        axiosResponse(
          resourceDocument(
            { enabledModelIds: ['m1', 'm2'] },
            {
              id: 'settings_1',
            },
          ),
        ),
      );

      const result = await service.toggleModel(orgId, 'm2', true);

      expect(http.patch).toHaveBeenCalledWith(`/${orgId}/settings`, {
        enabledModelIds: ['m1', 'm2'],
      });
      expect(result.enabledModelIds).toEqual(['m1', 'm2']);
    });

    it('returns current settings when the model is already enabled', async () => {
      mockSettings(['m1']);

      const result = await service.toggleModel(orgId, 'm1', true);

      expect(http.patch).not.toHaveBeenCalled();
      expect(result.enabledModelIds).toEqual(['m1']);
    });

    it('removes a model when disabling', async () => {
      mockSettings(['m1', 'm2']);
      http.patch.mockResolvedValue(
        axiosResponse(
          resourceDocument({ enabledModelIds: ['m1'] }, { id: 'settings_1' }),
        ),
      );

      await service.toggleModel(orgId, 'm2', false);

      expect(http.patch).toHaveBeenCalledWith(`/${orgId}/settings`, {
        enabledModelIds: ['m1'],
      });
    });

    it('treats missing enabledModelIds as an empty allowlist', async () => {
      mockSettings(undefined);
      http.patch.mockResolvedValue(
        axiosResponse(
          resourceDocument({ enabledModelIds: ['m9'] }, { id: 'settings_1' }),
        ),
      );

      await service.toggleModel(orgId, 'm9', true);

      expect(http.patch).toHaveBeenCalledWith(`/${orgId}/settings`, {
        enabledModelIds: ['m9'],
      });
    });
  });
});
