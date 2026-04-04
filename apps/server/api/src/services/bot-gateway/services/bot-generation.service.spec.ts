import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { ConfigService } from '@api/config/config.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { BotCommandType, IngredientCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

import { BotGenerationService } from './bot-generation.service';

vi.mock(
  '@api/helpers/utils/generation-defaults/generation-defaults.util',
  () => ({
    resolveGenerationDefaultModel: vi.fn(() => 'replicate_openai_gpt_image_1'),
  }),
);

const makeIngredientId = () => new Types.ObjectId().toString();

describe('BotGenerationService', () => {
  let service: BotGenerationService;
  let brandsService: vi.Mocked<Pick<BrandsService, 'findOne'>>;
  let creditsUtilsService: vi.Mocked<
    Pick<
      CreditsUtilsService,
      'getOrganizationCreditsBalance' | 'deductCreditsFromOrganization'
    >
  >;
  let organizationSettingsService: vi.Mocked<
    Pick<OrganizationSettingsService, 'findOne'>
  >;
  let sharedService: vi.Mocked<Pick<SharedService, 'saveDocuments'>>;
  let configService: vi.Mocked<Pick<ConfigService, 'ingredientsEndpoint'>>;
  let loggerService: vi.Mocked<Pick<LoggerService, 'log' | 'error' | 'warn'>>;

  const orgId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  const brandId = new Types.ObjectId().toString();
  const ingredientId = makeIngredientId();

  const resolvedUser = { brandId, organizationId: orgId, userId };
  const callbackCtx = { channelId: 'ch-1', messageId: 'msg-1' };

  const mockBrand = {
    _id: new Types.ObjectId(brandId),
    defaultImageModel: null,
    defaultVideoModel: null,
  };
  const mockSettings = { defaultImageModel: null, defaultVideoModel: null };
  const mockIngredientData = { _id: new Types.ObjectId(ingredientId) };
  const mockMetadataData = { _id: new Types.ObjectId() };

  beforeEach(async () => {
    brandsService = { findOne: vi.fn().mockResolvedValue(mockBrand) };
    creditsUtilsService = {
      deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(100),
    };
    organizationSettingsService = {
      findOne: vi.fn().mockResolvedValue(mockSettings),
    };
    sharedService = {
      saveDocuments: vi.fn().mockResolvedValue({
        ingredientData: mockIngredientData,
        metadataData: mockMetadataData,
      }),
    };
    configService = {
      ingredientsEndpoint: 'https://cdn.genfeed.ai',
    } as unknown as vi.Mocked<Pick<ConfigService, 'ingredientsEndpoint'>>;
    loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotGenerationService,
        { provide: BrandsService, useValue: brandsService },
        { provide: CreditsUtilsService, useValue: creditsUtilsService },
        {
          provide: OrganizationSettingsService,
          useValue: organizationSettingsService,
        },
        { provide: IngredientsService, useValue: {} },
        { provide: MetadataService, useValue: {} },
        { provide: SharedService, useValue: sharedService },
        { provide: ConfigService, useValue: configService },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    service = module.get<BotGenerationService>(BotGenerationService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── checkCredits ─────────────────────────────────────────────────────────
  describe('checkCredits', () => {
    it('returns hasCredits=true when balance >= required', async () => {
      creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(50);
      const result = await service.checkCredits(orgId, 10);
      expect(result.hasCredits).toBe(true);
      expect(result.balance).toBe(50);
    });

    it('returns hasCredits=false when balance < required', async () => {
      creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(3);
      const result = await service.checkCredits(orgId, 10);
      expect(result.hasCredits).toBe(false);
      expect(result.balance).toBe(3);
    });

    it('returns hasCredits=false and balance=0 on service error', async () => {
      creditsUtilsService.getOrganizationCreditsBalance.mockRejectedValue(
        new Error('DB error'),
      );
      const result = await service.checkCredits(orgId, 5);
      expect(result).toEqual({ balance: 0, hasCredits: false });
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  // ── getCreditCost ─────────────────────────────────────────────────────────
  describe('getCreditCost', () => {
    it('returns 5 for PROMPT_IMAGE', () => {
      expect(service.getCreditCost(BotCommandType.PROMPT_IMAGE)).toBe(5);
    });

    it('returns 20 for PROMPT_VIDEO', () => {
      expect(service.getCreditCost(BotCommandType.PROMPT_VIDEO)).toBe(20);
    });

    it('returns 0 for unknown command types', () => {
      expect(service.getCreditCost('UNKNOWN' as BotCommandType)).toBe(0);
    });
  });

  // ── triggerGeneration ─────────────────────────────────────────────────────
  describe('triggerGeneration', () => {
    it('creates ingredient and deducts credits for IMAGE command', async () => {
      const result = await service.triggerGeneration(
        resolvedUser,
        BotCommandType.PROMPT_IMAGE,
        'a beautiful sunset',
        callbackCtx as never,
      );
      expect(sharedService.saveDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ id: userId }),
        expect.objectContaining({ category: IngredientCategory.IMAGE }),
      );
      expect(
        creditsUtilsService.deductCreditsFromOrganization,
      ).toHaveBeenCalledWith(
        orgId,
        userId,
        5,
        expect.any(String),
        expect.any(String),
      );
      expect(result.ingredientId).toBe(ingredientId);
      expect(result.message).toContain('image');
    });

    it('creates ingredient and deducts credits for VIDEO command', async () => {
      const result = await service.triggerGeneration(
        resolvedUser,
        BotCommandType.PROMPT_VIDEO,
        'cinematic slow motion',
        callbackCtx as never,
      );
      expect(sharedService.saveDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ id: userId }),
        expect.objectContaining({ category: IngredientCategory.VIDEO }),
      );
      expect(
        creditsUtilsService.deductCreditsFromOrganization,
      ).toHaveBeenCalledWith(
        orgId,
        userId,
        20,
        expect.any(String),
        expect.any(String),
      );
      expect(result.message).toContain('video');
    });

    it('stores callback context under ingredientId', async () => {
      await service.triggerGeneration(
        resolvedUser,
        BotCommandType.PROMPT_IMAGE,
        'test prompt',
        { ...callbackCtx, ingredientId: undefined } as never,
      );
      const ctx = service.getCallbackContext(ingredientId);
      expect(ctx).toBeDefined();
    });

    it('throws when brand is not found', async () => {
      brandsService.findOne.mockResolvedValue(null);
      await expect(
        service.triggerGeneration(
          resolvedUser,
          BotCommandType.PROMPT_IMAGE,
          'x',
          callbackCtx as never,
        ),
      ).rejects.toThrow('Brand not found');
    });

    it('propagates errors from saveDocuments', async () => {
      sharedService.saveDocuments.mockRejectedValue(
        new Error('DB write failed'),
      );
      await expect(
        service.triggerGeneration(
          resolvedUser,
          BotCommandType.PROMPT_IMAGE,
          'y',
          callbackCtx as never,
        ),
      ).rejects.toThrow('DB write failed');
    });
  });

  // ── callback context management ───────────────────────────────────────────
  describe('callback context management', () => {
    it('getCallbackContext returns undefined for unknown id', () => {
      expect(service.getCallbackContext('nonexistent-id')).toBeUndefined();
    });

    it('removeCallbackContext removes stored context', async () => {
      await service.triggerGeneration(
        resolvedUser,
        BotCommandType.PROMPT_IMAGE,
        'remove-test',
        callbackCtx as never,
      );
      expect(service.getCallbackContext(ingredientId)).toBeDefined();
      service.removeCallbackContext(ingredientId);
      expect(service.getCallbackContext(ingredientId)).toBeUndefined();
    });
  });

  // ── getIngredientUrl ──────────────────────────────────────────────────────
  describe('getIngredientUrl', () => {
    it('returns image URL for IMAGE category', () => {
      const url = service.getIngredientUrl('abc123', IngredientCategory.IMAGE);
      expect(url).toBe('https://cdn.genfeed.ai/images/abc123');
    });

    it('returns video URL for VIDEO category', () => {
      const url = service.getIngredientUrl('abc123', IngredientCategory.VIDEO);
      expect(url).toBe('https://cdn.genfeed.ai/videos/abc123');
    });
  });
});
