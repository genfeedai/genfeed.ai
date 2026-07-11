/**
 * Real-backend proof of the "generate -> credit decrement" money path
 * (linking #334).
 *
 * Mirrors `stripe-webhook-credit-grant.integration.spec.ts` (#1398): real
 * service code, real Postgres via `PrismaService` / `E2ETestModule.forRoot`,
 * assertions against real `credit_balances` / `credit_transactions` rows —
 * never against a mock's own return value.
 *
 * Two tests:
 *  1. `ImageGenerationService.generateImage` is exercised through its real
 *     public entrypoint with the real routing/dispatch/prompt-building code
 *     paths, constructed directly (mirroring the existing
 *     `image-generation.service.spec.ts` unit-spec pattern) rather than
 *     through the full NestJS DI container, with only the four AI provider
 *     clients (`ReplicateService`, `FalService`, `KlingAIService`,
 *     `ComfyUIService`) swapped for canned-output mocks. This proves zero
 *     network + correct provider routing without needing to also stand up
 *     the cross-workspace `apps/server/workers` processor.
 *  2. `CreditsUtilsService.deductCreditsFromOrganization` — the exact method
 *     the worker's `CreditDeductionProcessor` calls after a generation
 *     completes — is called directly against a real Prisma-backed org,
 *     proving the balance decrement is real and that replaying the same
 *     `referenceId`/`referenceType` is idempotent (no double-deduction, no
 *     duplicate transaction row).
 */

// Allow skipping this file when the Prisma DB is not available
// Set SKIP_PRISMA_DB=true to skip all tests in this file
type SkippableSuiteFn = (name: string, fn: () => void | Promise<void>) => void;
type SkippableSuite = SkippableSuiteFn & { skip?: SkippableSuiteFn };
interface GlobalWithTestOverrides {
  describe: SkippableSuiteFn;
  it: SkippableSuiteFn;
  test: SkippableSuiteFn;
}

if (process.env.SKIP_PRISMA_DB === 'true') {
  const g = global as unknown as GlobalWithTestOverrides;
  const originalDescribe = describe as unknown as SkippableSuite;
  const originalIt = it as unknown as SkippableSuite;
  g.describe = (name, fn) =>
    originalDescribe.skip
      ? originalDescribe.skip(name, fn)
      : describe(name, fn);
  g.it = (name, fn) =>
    originalIt.skip ? originalIt.skip(name, fn) : it(name, fn);
  g.test = g.it;
}

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { ImageGenerationService } from '@api/collections/images/services/image-generation.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { RequestWithContext as ExpressRequest } from '@api/common/middleware/request-context.middleware';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  createTestOrganization,
  generateIdString,
} from '@api-test/e2e/e2e-test.utils';
import type { TestDatabaseHelper } from '@api-test/e2e-test.module';
import {
  createTestDatabaseHelper,
  E2ETestModule,
} from '@api-test/e2e-test.module';
import {
  createMockComfyUIService,
  createMockFalService,
  createMockKlingAIImageService,
  createMockReplicateService,
} from '@api-test/mocks/external-services.mocks';
import { MODEL_KEYS } from '@genfeedai/constants';
import { ActivitySource, CreditTransactionCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';

const ORG = 'org-generation-decrement';
const RESOLVED_BRAND = 'brand-resolved';
const FAL_MODEL = MODEL_KEYS.FAL_NANO_BANANA_2;

const buildUser = (organization: string = ORG): User =>
  ({
    id: 'auth-user-1',
    publicMetadata: {
      brand: 'brand-from-token',
      organization,
      user: 'user-1',
    },
  }) as unknown as User;

const buildRequest = (
  overrides: Record<string, unknown> = {},
): ExpressRequest =>
  ({
    originalUrl: '/api/images',
    params: {},
    query: {},
    ...overrides,
  }) as unknown as ExpressRequest;

const baseDto = (overrides: Partial<CreateImageDto> = {}): CreateImageDto =>
  ({
    height: 1080,
    model: FAL_MODEL,
    text: 'a sunset over the ocean',
    width: 1920,
    ...overrides,
  }) as CreateImageDto;

/**
 * Direct construction (no NestJS DI container), mirroring the proven
 * pattern in `image-generation.service.spec.ts`. Only the four AI provider
 * clients are swapped for the shared `external-services.mocks.ts` factories
 * so this spec doesn't drift from the canonical mock shapes; every other
 * dependency is a lightweight inline stub, matching the unit spec exactly.
 */
const createImageGenerationService = () => {
  let savedDocCount = 0;
  const sharedService = {
    saveDocuments: vi.fn().mockImplementation(() => {
      const n = savedDocCount++;
      return Promise.resolve({
        ingredientData: {
          id: `ing-${n}`,
          toString: () => `ing-${n}`,
        },
        metadataData: { id: `meta-${n}` },
      });
    }),
  };

  const brandsService = {
    findOne: vi.fn().mockResolvedValue({
      id: RESOLVED_BRAND,
      description: 'desc',
      label: 'Brand',
      organization: ORG,
      primaryColor: '#fff',
      secondaryColor: '#000',
      text: 'text',
    }),
  };
  const organizationSettingsService = {
    findOne: vi.fn().mockResolvedValue(null),
  };
  const modelRegistrationService = {
    validateModelForOrg: vi.fn().mockResolvedValue(undefined),
  };
  const modelsService = { findOne: vi.fn().mockResolvedValue({ cost: 10 }) };
  const creditsUtilsService = {
    checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
    getOrganizationCreditsBalance: vi.fn().mockResolvedValue(1000),
  };
  const promptsService = {
    create: vi.fn().mockResolvedValue({ id: 'prompt-doc', original: 'built' }),
  };
  const promptBuilderService = {
    buildPrompt: vi.fn().mockResolvedValue({
      input: { prompt: 'built-prompt' },
      templateUsed: 'template',
      templateVersion: '1.0.0',
    }),
  };
  const replicateService = createMockReplicateService();
  const comfyUIService = createMockComfyUIService();
  const klingAIService = createMockKlingAIImageService();
  const falService = createMockFalService();
  const leonardoaiService = {
    generateImage: vi.fn().mockResolvedValue('leo-gen'),
  };
  const metadataService = { patch: vi.fn().mockResolvedValue(undefined) };
  const imagesService = {
    findOne: vi.fn().mockResolvedValue({ _id: 'ing-0', status: 'completed' }),
    patch: vi.fn().mockResolvedValue(undefined),
  };
  const activitiesService = {
    create: vi.fn().mockResolvedValue({ id: { toString: () => 'act' } }),
  };
  const websocketService = {
    publishBackgroundTaskUpdate: vi.fn().mockResolvedValue(undefined),
    publishVideoComplete: vi.fn().mockResolvedValue(undefined),
  };
  const failedGenerationService = {
    handleFailedImageGeneration: vi.fn().mockResolvedValue(undefined),
  };
  const routerService = {
    getDefaultModel: vi.fn().mockResolvedValue(FAL_MODEL),
    selectModel: vi.fn(),
  };
  const ingredientCompletionService = {
    waitForMultipleIngredientsCompletion: vi
      .fn()
      .mockResolvedValue([{ _id: 'ing-0', status: 'completed' }]),
    waitForIngredientCompletion: vi
      .fn()
      .mockResolvedValue({ _id: 'ing-0', status: 'completed' }),
  };
  const filesClientService = { uploadToS3: vi.fn() };
  const assetsService = {};
  const ingredientsService = {};
  const configService = {};
  const loggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;

  const service = new ImageGenerationService(
    configService as never,
    activitiesService as never,
    assetsService as never,
    brandsService as never,
    comfyUIService as never,
    creditsUtilsService as never,
    failedGenerationService as never,
    filesClientService as never,
    falService as never,
    ingredientCompletionService as never,
    imagesService as never,
    ingredientsService as never,
    organizationSettingsService as never,
    klingAIService as never,
    leonardoaiService as never,
    loggerService,
    metadataService as never,
    modelRegistrationService as never,
    modelsService as never,
    promptBuilderService as never,
    promptsService as never,
    replicateService as never,
    routerService as never,
    sharedService as never,
    websocketService as never,
  );

  return {
    comfyUIService,
    falService,
    klingAIService,
    replicateService,
    service,
  };
};

describe('Generation completes with a fake AI provider (zero network, real routing)', () => {
  it('dispatches to Fal only when the DTO selects a Fal model key', async () => {
    const {
      service,
      falService,
      replicateService,
      comfyUIService,
      klingAIService,
    } = createImageGenerationService();

    const response = await service.generateImage(
      buildUser(),
      baseDto({ model: FAL_MODEL }),
      buildRequest(),
    );

    expect(response).toHaveProperty('data');
    expect(falService.generateImage).toHaveBeenCalledTimes(1);
    expect(replicateService.generateTextToImage).not.toHaveBeenCalled();
    expect(comfyUIService.generateImage).not.toHaveBeenCalled();
    expect(klingAIService.queueGenerateImage).not.toHaveBeenCalled();
  });
});

describe('Credit decrement is real and idempotent (#334 real-backend E2E)', () => {
  let moduleRef: TestingModule;
  let dbHelper: TestDatabaseHelper;
  let creditsUtilsService: CreditsUtilsService;
  let prisma: PrismaService;

  const STARTING_BALANCE = 5000;
  const DEDUCT_AMOUNT = 250;
  const REFERENCE_ID = 'generation:test-1';
  const REFERENCE_TYPE = 'generation';

  beforeAll(async () => {
    const moduleConfig = await E2ETestModule.forRoot({
      providers: [
        CreditsUtilsService,
        CreditBalanceService,
        CreditTransactionsService,
        {
          provide: OrganizationSettingsService,
          useValue: { findOne: vi.fn().mockResolvedValue(null) },
        },
        {
          provide: NotificationsPublisherService,
          useValue: { emit: vi.fn().mockResolvedValue(undefined) },
        },
        {
          provide: AccessBootstrapCacheService,
          useValue: {
            invalidateForOrganization: vi.fn().mockResolvedValue(undefined),
            invalidateForUser: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: CacheInvalidationService,
          useValue: { invalidate: vi.fn().mockResolvedValue(undefined) },
        },
        { provide: EventEmitter2, useValue: { emit: vi.fn() } },
      ],
    });

    moduleRef = await Test.createTestingModule({
      imports: [moduleConfig],
    }).compile();

    dbHelper = createTestDatabaseHelper(moduleRef);
    creditsUtilsService = moduleRef.get(CreditsUtilsService);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await dbHelper.clearDatabase();
  });

  const seedOrganizationWithBalance = async (): Promise<string> => {
    const organizationId = generateIdString();
    await dbHelper.seedCollection('organizations', [
      createTestOrganization({ id: organizationId }),
    ]);

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await creditsUtilsService.addOrganizationCreditsWithExpiration(
      organizationId,
      STARTING_BALANCE,
      'test-seed',
      'seed starting balance for generation-decrement e2e',
      expiresAt,
    );

    return organizationId;
  };

  it('decreases the real balance by exactly the deducted amount and records one DEDUCT transaction', async () => {
    const organizationId = await seedOrganizationWithBalance();

    await creditsUtilsService.deductCreditsFromOrganization(
      organizationId,
      'user-1',
      DEDUCT_AMOUNT,
      'generation completed',
      ActivitySource.SCRIPT,
      { referenceId: REFERENCE_ID, referenceType: REFERENCE_TYPE },
    );

    const balance = await prisma.creditBalance.findFirst({
      where: { isDeleted: false, organizationId },
    });
    expect(balance?.balance).toBe(STARTING_BALANCE - DEDUCT_AMOUNT);

    const transactions = await prisma.creditTransaction.findMany({
      where: {
        category: CreditTransactionCategory.DEDUCT,
        isDeleted: false,
        organizationId,
      },
    });
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.amount).toBe(DEDUCT_AMOUNT);
    expect(transactions[0]?.referenceId).toBe(REFERENCE_ID);
    expect(transactions[0]?.referenceType).toBe(REFERENCE_TYPE);
  });

  it('is idempotent: replaying the same referenceId/referenceType does not double-deduct', async () => {
    const organizationId = await seedOrganizationWithBalance();

    await creditsUtilsService.deductCreditsFromOrganization(
      organizationId,
      'user-1',
      DEDUCT_AMOUNT,
      'generation completed',
      ActivitySource.SCRIPT,
      { referenceId: REFERENCE_ID, referenceType: REFERENCE_TYPE },
    );

    // Replay: same reference id/type, as if the worker processor retried or
    // redelivered the completion event.
    await creditsUtilsService.deductCreditsFromOrganization(
      organizationId,
      'user-1',
      DEDUCT_AMOUNT,
      'generation completed',
      ActivitySource.SCRIPT,
      { referenceId: REFERENCE_ID, referenceType: REFERENCE_TYPE },
    );

    const balance = await prisma.creditBalance.findFirst({
      where: { isDeleted: false, organizationId },
    });
    expect(balance?.balance).toBe(STARTING_BALANCE - DEDUCT_AMOUNT);

    const transactions = await prisma.creditTransaction.findMany({
      where: {
        category: CreditTransactionCategory.DEDUCT,
        isDeleted: false,
        organizationId,
      },
    });
    expect(transactions).toHaveLength(1);
  });
});
