import { BrandGenerationService } from '@api/collections/brands/services/brand-generation.service';
import { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import { BrandKitDraftService } from '@api/collections/brands/services/brand-kit-draft.service';
import { BrandRelocationService } from '@api/collections/brands/services/brand-relocation.service';
import { DefaultRecurringContentService } from '@api/collections/brands/services/default-recurring-content.service';
import { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { StreaksService } from '@api/collections/streaks/services/streaks.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { BetterAuthIdentityCacheService } from '@api/common/services/better-auth-identity-cache.service';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { createTestUser } from '@api-test/e2e/e2e-test.utils';
import {
  BRAND_SERVICE_E2E_MOCK_PROVIDERS,
  COLLECTION_E2E_MOCK_PROVIDERS,
  E2ETestModule,
  TestDatabaseHelper,
} from '@api-test/e2e-test.module';
import { describe, expect, it, vi } from 'vitest';

describe('E2E fixture contracts', () => {
  it('creates users with canonical Prisma fields', () => {
    expect(createTestUser()).not.toHaveProperty('isActive');
  });

  it('strips legacy user activity state at the shared seed boundary', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'user-1' });
    const helper = new TestDatabaseHelper({
      user: { create },
    } as unknown as PrismaService);

    await helper.seedCollection('users', [
      {
        email: 'user-1@example.com',
        handle: 'user-1',
        id: 'user-1',
        isActive: true,
      },
    ]);

    expect(create).toHaveBeenCalledWith({
      data: {
        email: 'user-1@example.com',
        handle: 'user-1',
        id: 'user-1',
      },
    });
  });

  it('provides every optional BrandsService collaborator to CRUD E2E modules', async () => {
    const expectedBrandTokens = [
      CacheInvalidationService,
      BrandRelocationService,
      BrandGenerationService,
      BrandKitAssetsService,
      BrandKitDraftService,
    ];
    const expectedCollectionTokens = [
      CredentialCryptoService,
      StreaksService,
      DefaultRecurringContentService,
      RolesService,
      OrganizationSettingsService,
      RequestContextCacheService,
      AccessBootstrapCacheService,
      BetterAuthIdentityCacheService,
    ];
    const configuredBrandTokens = BRAND_SERVICE_E2E_MOCK_PROVIDERS.map(
      (provider) => provider.provide,
    );
    const configuredCollectionTokens = COLLECTION_E2E_MOCK_PROVIDERS.map(
      (provider) => provider.provide,
    );

    expect(configuredBrandTokens).toEqual(expectedBrandTokens);
    expect(configuredCollectionTokens).toEqual(expectedCollectionTokens);

    const moduleConfig = await E2ETestModule.forRoot({
      providers: [BrandGenerationService],
    });
    const providerTokens = (moduleConfig.providers ?? []).map((provider) =>
      typeof provider === 'object' && provider !== null && 'provide' in provider
        ? provider.provide
        : provider,
    );

    expect(providerTokens).toEqual(
      expect.arrayContaining([
        ...expectedBrandTokens,
        ...expectedCollectionTokens,
      ]),
    );
  });
});
