import type { ResolveGenerationBrandApiKeysServiceLike } from '@api/collections/api-keys/utils/resolve-generation-brand-for-caller.util';
import { resolveGenerationBrandIdForCaller } from '@api/collections/api-keys/utils/resolve-generation-brand-for-caller.util';
import type {
  ResolveGenerationBrandMembersServiceLike,
  ResolveGenerationBrandServiceLike,
} from '@api/collections/brands/utils/resolve-generation-brand.util';
import { BadRequestException } from '@nestjs/common';
import type { Mock } from 'vitest';

describe('resolveGenerationBrandIdForCaller', () => {
  const organizationId = 'org-1';
  const userId = 'user-1';

  let apiKeysService: {
    findOne: Mock<ResolveGenerationBrandApiKeysServiceLike['findOne']>;
  };
  let brandsService: {
    findOne: Mock<ResolveGenerationBrandServiceLike['findOne']>;
  };
  let membersService: {
    findOne: Mock<ResolveGenerationBrandMembersServiceLike['findOne']>;
  };

  beforeEach(() => {
    apiKeysService = {
      findOne: vi.fn<ResolveGenerationBrandApiKeysServiceLike['findOne']>(),
    };
    brandsService = {
      findOne: vi
        .fn<ResolveGenerationBrandServiceLike['findOne']>()
        .mockResolvedValue(null),
    };
    membersService = {
      findOne: vi
        .fn<ResolveGenerationBrandMembersServiceLike['findOne']>()
        .mockResolvedValue(null),
    };
  });

  function stubValidBrands(validBrandIds: readonly string[]): void {
    brandsService.findOne.mockImplementation(
      async (query: { id?: unknown; organizationId?: unknown }) => {
        if (
          typeof query.id === 'string' &&
          validBrandIds.includes(query.id) &&
          query.organizationId === organizationId
        ) {
          return { id: query.id };
        }
        return null;
      },
    );
  }

  const services = () => ({ apiKeysService, brandsService, membersService });
  const messages = {
    noApiKeyDefaultBrandMessage: 'no api key default brand',
    noBrandMessage: 'no brand',
  };

  describe('session/app callers', () => {
    it('prefers the explicit brandId over the ambient user.brandId', async () => {
      stubValidBrands(['explicit-brand', 'ambient-brand']);

      const result = await resolveGenerationBrandIdForCaller({
        ...messages,
        explicitBrandId: 'explicit-brand',
        services: services(),
        user: {
          brandId: 'ambient-brand',
          id: userId,
          organizationId,
        },
      });

      expect(result).toBe('explicit-brand');
      expect(apiKeysService.findOne).not.toHaveBeenCalled();
    });

    it('falls back to the ambient user.brandId when it validates', async () => {
      stubValidBrands(['ambient-brand']);

      const result = await resolveGenerationBrandIdForCaller({
        ...messages,
        services: services(),
        user: {
          brandId: 'ambient-brand',
          id: userId,
          organizationId,
        },
      });

      expect(result).toBe('ambient-brand');
    });

    it('falls back to the member currentBrandId when user.brandId is stale (e.g. a just-deleted brand)', async () => {
      stubValidBrands(['fresh-current-brand']);
      membersService.findOne.mockResolvedValue({
        currentBrandId: 'fresh-current-brand',
      });

      const result = await resolveGenerationBrandIdForCaller({
        ...messages,
        services: services(),
        user: {
          brandId: 'stale-deleted-brand',
          id: userId,
          organizationId,
          userId,
        },
      });

      expect(membersService.findOne).toHaveBeenCalledWith({
        organizationId,
        userId,
      });
      expect(result).toBe('fresh-current-brand');
    });

    it('rejects with the session message when nothing resolves', async () => {
      await expect(
        resolveGenerationBrandIdForCaller({
          ...messages,
          services: services(),
          user: { id: userId, organizationId },
        }),
      ).rejects.toThrow(new BadRequestException('no brand'));
    });
  });

  describe('API-key callers', () => {
    it("resolves the key's validated defaultBrandId as context, never the ambient user.brandId", async () => {
      stubValidBrands(['key-default-brand']);
      apiKeysService.findOne.mockResolvedValue({
        defaultBrandId: 'key-default-brand',
      });

      const result = await resolveGenerationBrandIdForCaller({
        ...messages,
        services: services(),
        user: {
          apiKeyId: 'apikey-1',
          // Would resolve to a DIFFERENT brand if this were mistakenly used
          // as context instead of the key's defaultBrandId.
          brandId: 'any-org-brand-ambient-fallback',
          id: userId,
          isApiKey: true,
          organizationId,
        },
      });

      expect(apiKeysService.findOne).toHaveBeenCalledWith({
        id: 'apikey-1',
      });
      expect(result).toBe('key-default-brand');
    });

    it('validates the explicit brandId as same-org before trusting it', async () => {
      stubValidBrands([]); // nothing validates for this org
      apiKeysService.findOne.mockResolvedValue({ defaultBrandId: null });
      membersService.findOne.mockResolvedValue(null);

      await expect(
        resolveGenerationBrandIdForCaller({
          explicitBrandId: 'other-org-brand',
          ...messages,
          services: services(),
          user: {
            apiKeyId: 'apikey-1',
            id: userId,
            isApiKey: true,
            organizationId,
          },
        }),
      ).rejects.toThrow(new BadRequestException('no api key default brand'));
    });

    it("falls back to the key owner's member currentBrandId when the key has no valid default brand", async () => {
      stubValidBrands(['owner-current-brand']);
      apiKeysService.findOne.mockResolvedValue({ defaultBrandId: null });
      membersService.findOne.mockResolvedValue({
        currentBrandId: 'owner-current-brand',
      });

      const result = await resolveGenerationBrandIdForCaller({
        ...messages,
        services: services(),
        user: {
          apiKeyId: 'apikey-1',
          id: userId,
          isApiKey: true,
          organizationId,
          // The API key's OWNING user — MembersService.findOne must be
          // queried for this id, not the caller's own `id`.
          userId,
        },
      });

      expect(membersService.findOne).toHaveBeenCalledWith({
        organizationId,
        userId,
      });
      expect(result).toBe('owner-current-brand');
    });

    it('rejects with the API-key message when no step resolves — never widens to "any brand in the org"', async () => {
      apiKeysService.findOne.mockResolvedValue({ defaultBrandId: null });
      membersService.findOne.mockResolvedValue(null);

      await expect(
        resolveGenerationBrandIdForCaller({
          ...messages,
          services: services(),
          user: {
            apiKeyId: 'apikey-1',
            // Even if a caller-supplied value happened to carry a brandId
            // here, the API-key branch must never fall through to it.
            brandId: 'should-not-be-used',
            id: userId,
            isApiKey: true,
            organizationId,
          },
        }),
      ).rejects.toThrow(new BadRequestException('no api key default brand'));
    });

    it('treats a missing apiKeyId as no context, still falling back to the member currentBrandId', async () => {
      stubValidBrands(['owner-current-brand']);
      membersService.findOne.mockResolvedValue({
        currentBrandId: 'owner-current-brand',
      });

      const result = await resolveGenerationBrandIdForCaller({
        ...messages,
        services: services(),
        user: {
          id: userId,
          isApiKey: true,
          organizationId,
          userId,
        },
      });

      expect(apiKeysService.findOne).not.toHaveBeenCalled();
      expect(result).toBe('owner-current-brand');
    });
  });
});
