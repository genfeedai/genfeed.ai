import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import { projectModelBillablePricingProfile } from '@api/collections/models/utils/model-billable-pricing-profile.util';
import { PostsGenerationController } from '@api/collections/posts/controllers/operations/posts-generation.controller';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { CREDITS_KEY } from '@api/helpers/decorators/credits/credits.decorator';
import {
  CreditsGuard,
  type CreditsGuardRequest,
} from '@api/helpers/guards/credits/credits.guard';
import type { ByokService } from '@api/services/byok/byok.service';
import { modelProviderToByokProvider } from '@api/services/byok/byok-provider-map.util';
import { isOpenRouterTextModel } from '@api/services/integrations/openrouter/openrouter-model.util';
import { runtimeSettingsMock } from '@api-test/helpers/runtime-settings.mock';
import { ByokProvider, ModelProvider } from '@genfeedai/contracts';
import {
  getModelCatalogForDeployment,
  type ModelCatalogSeedEntry,
} from '@genfeedai/contracts/constants';
import type {
  CreditsConfig,
  ModelBillablePricingProfile,
} from '@genfeedai/contracts/interfaces';
import { testId } from '@helpers/testing/test-id.helper';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { ServiceUnavailableException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

const orgId = testId('org');

const loggerService = {
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
} as unknown as LoggerService;

function catalogRow(key: string): ModelCatalogSeedEntry {
  const rows = getModelCatalogForDeployment(true).filter(
    (entry) => entry.key === key,
  );
  expect(rows).toHaveLength(1);
  return rows[0] as ModelCatalogSeedEntry;
}

/** The registry row exactly as ModelCatalogSeedService writes it, plus optional overrides. */
function registryRow(
  entry: ModelCatalogSeedEntry,
  overrides: Partial<
    Pick<ModelCatalogSeedEntry, 'cost' | 'isActive' | 'provider'>
  > = {},
): ModelDocument {
  return {
    cost: entry.cost,
    costPerUnit: entry.costPerUnit ?? null,
    endpoint: entry.endpoint ?? entry.key,
    isActive: entry.isActive,
    isDeleted: false,
    isFree: entry.isFree ?? false,
    key: entry.key,
    label: entry.label,
    minCost: entry.minCost ?? null,
    pricingType: entry.pricingType ?? null,
    provider: entry.provider,
    providerCostUsd: entry.providerCostUsd ?? null,
    ...overrides,
  } as unknown as ModelDocument;
}

function billingProfile(row: ModelDocument): ModelBillablePricingProfile {
  return projectModelBillablePricingProfile(
    {
      cost: row.cost,
      costPerUnit: row.costPerUnit ?? null,
      endpoint: row.endpoint ?? row.key,
      hasAudioToggle: false,
      hasResolutionOptions: false,
      isActive: row.isActive,
      isDeleted: row.isDeleted ?? false,
      isFree: row.isFree ?? false,
      key: row.key,
      minCost: row.minCost ?? null,
      pendingProviderContractVersion: null,
      pricingType: row.pricingType ?? null,
      provider: row.provider,
      providerCostUsd: row.providerCostUsd ?? null,
      providerInputSchema: null,
      reviewedProviderContractVersion: null,
    },
    [],
  );
}

function enhancementsCreditsConfig(): CreditsConfig {
  const config = Reflect.getMetadata(
    CREDITS_KEY,
    PostsGenerationController.prototype.enhancePost,
  ) as CreditsConfig | undefined;
  expect(config).toBeDefined();
  return config as CreditsConfig;
}

function buildGuard(row: ModelDocument | null): {
  byokService: { resolveApiKey: ReturnType<typeof vi.fn> };
  guard: CreditsGuard;
} {
  const modelsService = {
    findBillablePricingProfile: vi.fn(async (key: string) =>
      row && row.key === key ? billingProfile(row) : null,
    ),
    findOne: vi.fn(async ({ key }: { key: string }) =>
      row && row.key === key ? row : null,
    ),
  };
  const byokService = { resolveApiKey: vi.fn().mockResolvedValue(undefined) };
  const creditsUtilsService = {
    checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
    getOrganizationCreditsBalance: vi.fn().mockResolvedValue(100),
    reserveCredits: vi
      .fn()
      .mockImplementation((input: { amount: number; metadata?: unknown }) =>
        Promise.resolve({
          amount: input.amount,
          id: 'reservation-1',
          metadata: input.metadata,
          status: 'RESERVED',
        }),
      ),
  };

  return {
    byokService,
    guard: new CreditsGuard(
      runtimeSettingsMock({ get: vi.fn() } as unknown as ConfigService),
      new Reflector(),
      creditsUtilsService as unknown as CreditsUtilsService,
      modelsService as unknown as ModelsService,
      byokService as unknown as ByokService,
      loggerService,
      new ModelCreditQuoteService(modelsService as unknown as ModelsService),
    ),
  };
}

function buildRequest(): CreditsGuardRequest {
  return {
    body: { data: { attributes: { prompt: 'Make it punchier' } } },
    params: {},
    user: { id: 'user-1', organizationId: orgId, userId: 'user-1' },
  } as unknown as CreditsGuardRequest;
}

/**
 * ReplicateService.generateTextCompletionSync sends this key through
 * OpenRouter, so the tariff row and the route's BYOK/billing provider must
 * both be OpenRouter.
 */
function expectRouteMatchesDispatch(
  config: CreditsConfig,
  row: ModelDocument,
): void {
  expect(isOpenRouterTextModel(DEFAULT_MINI_TEXT_MODEL)).toBe(true);
  expect(row.provider).toBe(ModelProvider.OPENROUTER);
  expect(config.modelKey).toBe(row.key);
  expect(config.provider).toBe(ByokProvider.OPENROUTER);
  expect(modelProviderToByokProvider(row.provider)).toBe(config.provider);
}

describe('POST /posts/:postId/enhancements credits pricing', () => {
  const seededRow = registryRow(catalogRow(DEFAULT_MINI_TEXT_MODEL));

  it('prices the model the route actually dispatches', () => {
    expectRouteMatchesDispatch(enhancementsCreditsConfig(), seededRow);
  });

  it('is admitted by the real credits guard against the seeded registry row', async () => {
    const { byokService, guard } = buildGuard(seededRow);
    const request = buildRequest();

    await expect(
      guard.admit(request, enhancementsCreditsConfig()),
    ).resolves.toBe(true);

    expect(byokService.resolveApiKey).toHaveBeenCalledWith(
      orgId,
      ByokProvider.OPENROUTER,
    );
    expect(request.creditsConfig).toMatchObject({
      amount: seededRow.cost,
      modelKey: DEFAULT_MINI_TEXT_MODEL,
      modelQuote: {
        credits: seededRow.cost,
        modelKey: DEFAULT_MINI_TEXT_MODEL,
        provider: ModelProvider.OPENROUTER,
      },
    });
    expect(seededRow.cost).toBeGreaterThan(0);
  });

  it('quotes every DEFAULT_MINI_TEXT_MODEL route on this controller against its dispatch provider', async () => {
    const prototype = PostsGenerationController.prototype as unknown as Record<
      string,
      unknown
    >;
    const miniTextConfigs = Object.getOwnPropertyNames(prototype)
      .map((name) => prototype[name])
      .filter(
        (handler): handler is () => unknown => typeof handler === 'function',
      )
      .map(
        (handler) =>
          Reflect.getMetadata(CREDITS_KEY, handler) as
            | CreditsConfig
            | undefined,
      )
      .filter(
        (config): config is CreditsConfig =>
          config?.modelKey === DEFAULT_MINI_TEXT_MODEL,
      );

    expect(miniTextConfigs.length).toBeGreaterThan(1);
    for (const config of miniTextConfigs) {
      if (config.provider !== undefined) {
        expect(config.provider).toBe(
          modelProviderToByokProvider(seededRow.provider),
        );
      }
      const { guard } = buildGuard(seededRow);
      await expect(guard.admit(buildRequest(), config)).resolves.toBe(true);
    }
  });

  describe('regressions', () => {
    it('answers PRICING_UNAVAILABLE when the registry row is the uncurated media-catalog placeholder', async () => {
      // The media pass seeded this key inactive at cost 0, which produced the
      // 0.2.7 production 503 before the product-text row was curated.
      const { guard } = buildGuard(
        registryRow(catalogRow(DEFAULT_MINI_TEXT_MODEL), {
          cost: 0,
          isActive: false,
        }),
      );

      await expect(
        guard.admit(buildRequest(), enhancementsCreditsConfig()),
      ).rejects.toMatchObject({
        response: { code: 'PRICING_UNAVAILABLE' },
        status: 503,
      });
    });

    it('rejects a tariff whose provider differs from the provider the quote is requested for', async () => {
      const modelsService = {
        findBillablePricingProfile: vi.fn(async () =>
          billingProfile(seededRow),
        ),
      };
      const quote = new ModelCreditQuoteService(
        modelsService as unknown as ModelsService,
      );

      await expect(
        quote.quoteSnapshotByKey(DEFAULT_MINI_TEXT_MODEL, {
          organizationId: orgId,
          provider: ModelProvider.REPLICATE,
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(
        quote.quoteSnapshotByKey(DEFAULT_MINI_TEXT_MODEL, {
          organizationId: orgId,
          provider: ModelProvider.OPENROUTER,
        }),
      ).resolves.toMatchObject({ credits: seededRow.cost });
    });

    it('flags a seeded row re-pointed at a provider the route does not dispatch through', () => {
      const repointed = registryRow(catalogRow(DEFAULT_MINI_TEXT_MODEL), {
        provider: ModelProvider.REPLICATE,
      });

      expect(() =>
        expectRouteMatchesDispatch(enhancementsCreditsConfig(), repointed),
      ).toThrow();
    });

    it('flags a route that prices a different key than the model it dispatches', () => {
      expect(() =>
        expectRouteMatchesDispatch(
          { ...enhancementsCreditsConfig(), modelKey: 'google/gemini-9-fake' },
          seededRow,
        ),
      ).toThrow();
    });
  });
});
