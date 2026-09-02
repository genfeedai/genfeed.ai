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

import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { ImageGenerationService } from '@api/collections/images/services/image-generation.service';
import { ImageGenerationAdmissionService } from '@api/collections/images/services/image-generation-admission.service';
import { ImageGenerationCreditsService } from '@api/collections/images/services/image-generation-credits.service';
import { ImageGenerationProviderDispatchService } from '@api/collections/images/services/image-generation-provider-dispatch.service';
import { ImageGenerationProviderRegistryService } from '@api/collections/images/services/image-generation-provider-registry.service';
import { FalImageGenerationProviderAdapter } from '@api/collections/images/services/providers/fal-image-generation-provider.adapter';
import { GenfeedAiImageGenerationProviderAdapter } from '@api/collections/images/services/providers/genfeedai-image-generation-provider.adapter';
import { HiggsFieldImageGenerationProviderAdapter } from '@api/collections/images/services/providers/higgsfield-image-generation-provider.adapter';
import { KlingAiImageGenerationProviderAdapter } from '@api/collections/images/services/providers/klingai-image-generation-provider.adapter';
import { LeonardoImageGenerationProviderAdapter } from '@api/collections/images/services/providers/leonardo-image-generation-provider.adapter';
import { ReplicateImageGenerationProviderAdapter } from '@api/collections/images/services/providers/replicate-image-generation-provider.adapter';
import { SdxlImageGenerationProviderAdapter } from '@api/collections/images/services/providers/sdxl-image-generation-provider.adapter';
import type { RequestWithContext as ExpressRequest } from '@api/common/middleware/request-context.middleware';
import {
  createTestMember,
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
import {
  ActivitySource,
  CreditReservationStatus,
  CreditTransactionCategory,
  IngredientStatus,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import { BillingAccountsService } from '@server/collections/billing-accounts/services/billing-accounts.service';
import { CreditBalanceService } from '@server/collections/credits/services/credit-balance.service';
import { CreditReservationService } from '@server/collections/credits/services/credit-reservation.service';
import { CreditTransactionsService } from '@server/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@server/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@server/collections/organization-settings/services/organization-settings.service';
import { AccessBootstrapCacheService } from '@server/common/services/access-bootstrap-cache.service';
import { CacheInvalidationService } from '@server/common/services/cache-invalidation.service';
import { TransactionUtil } from '@server/helpers/utils/transaction/transaction.util';
import { NotificationsPublisherService } from '@server/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

const ORG = 'org-generation-decrement';
const RESOLVED_BRAND = 'brand-resolved';
const FAL_MODEL = MODEL_KEYS.FAL_NANO_BANANA_2;

const buildUser = (organization: string = ORG): User =>
  ({
    id: 'auth-user-1',
    brandId: 'brand-from-token',
    organization,
    userId: 'user-1',
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
    createMediaDocuments: vi.fn().mockImplementation(() => {
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
  const higgsFieldService = {
    generateTextToImage: vi.fn(),
    waitForImageCompletion: vi.fn(),
  };
  const leonardoaiService = {
    generateImage: vi.fn().mockResolvedValue('leo-gen'),
  };
  const metadataService = { patch: vi.fn().mockResolvedValue(undefined) };
  const imagesService = {
    findOne: vi.fn().mockResolvedValue({
      id: 'ing-0',
      status: IngredientStatus.PROCESSING,
    }),
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
    // Stands in for the registry policy: the first candidate the registry
    // carries wins, otherwise the category default (#2422 Phase C).
    resolveModelKey: vi
      .fn()
      .mockImplementation(
        ({ candidates }: { candidates?: Array<string | null | undefined> }) => {
          const key = candidates?.find((candidate): candidate is string =>
            Boolean(candidate),
          );

          return Promise.resolve(
            key
              ? { key, source: 'candidate' }
              : { key: FAL_MODEL, source: 'registry-default' },
          );
        },
      ),
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

  const providerRegistry = new ImageGenerationProviderRegistryService(
    new GenfeedAiImageGenerationProviderAdapter(comfyUIService as never),
    new KlingAiImageGenerationProviderAdapter(klingAIService as never),
    new FalImageGenerationProviderAdapter(falService as never),
    new LeonardoImageGenerationProviderAdapter(leonardoaiService as never),
    new ReplicateImageGenerationProviderAdapter(
      promptBuilderService as never,
      replicateService as never,
    ),
    new SdxlImageGenerationProviderAdapter(),
    new HiggsFieldImageGenerationProviderAdapter(higgsFieldService as never),
  );
  const generationEventWebhookService = {
    emitGenerationCompleted: vi.fn().mockResolvedValue(undefined),
    emitGenerationFailed: vi.fn().mockResolvedValue(undefined),
  };
  const mediaGenerationCostService = {
    recordGenerationCost: vi.fn().mockResolvedValue(undefined),
  };
  const providerDispatchService = new ImageGenerationProviderDispatchService(
    activitiesService as never,
    failedGenerationService as never,
    filesClientService as never,
    generationEventWebhookService as never,
    mediaGenerationCostService as never,
    imagesService as never,
    loggerService,
    metadataService as never,
    providerRegistry,
    sharedService as never,
    websocketService as never,
  );
  const creditsService = new ImageGenerationCreditsService(
    creditsUtilsService as never,
    modelsService as never,
    providerRegistry,
    {
      isByokActiveForProvider: vi.fn().mockResolvedValue(false),
      isByokBillingInGoodStanding: vi.fn().mockResolvedValue(true),
    } as never,
  );
  const admissionService = new ImageGenerationAdmissionService(
    assetsService as never,
    configService as never,
    creditsService,
    imagesService as never,
    ingredientsService as never,
    loggerService,
  );

  const service = new ImageGenerationService(
    brandsService as never,
    admissionService,
    ingredientCompletionService as never,
    providerDispatchService,
    imagesService as never,
    organizationSettingsService as never,
    loggerService,
    modelRegistrationService as never,
    promptBuilderService as never,
    promptsService as never,
    routerService as never,
    sharedService as never,
    {
      bindCancelOnAbort: vi.fn(),
      cancelProcessingIngredient: vi.fn(),
    } as never,
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
  let billingAccountsService: BillingAccountsService;
  let dbHelper: TestDatabaseHelper;
  let creditsUtilsService: CreditsUtilsService;
  let creditReservationService: CreditReservationService;
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
        CreditReservationService,
        CreditTransactionsService,
        TransactionUtil,
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
    billingAccountsService = moduleRef.get(BillingAccountsService);
    creditsUtilsService = moduleRef.get(CreditsUtilsService);
    creditReservationService = moduleRef.get(CreditReservationService);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  beforeEach(async () => {
    await dbHelper.clearDatabase();
  });

  const seedOrganizationWithBalance = async (): Promise<string> => {
    const organizationId = generateIdString();
    const userId = generateIdString();
    await dbHelper.seedCollection('organizations', [
      createTestOrganization({ id: organizationId, userId }),
    ]);
    await dbHelper.seedCollection('members', [
      createTestMember({ organizationId, roleId: 'owner', userId }),
    ]);
    await billingAccountsService.ensureForOrganization({
      organizationId,
      userId,
    });

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

  it('allows only the covered concurrent reservations and never makes available credits negative', async () => {
    const organizationId = await seedOrganizationWithBalance();

    const attempts = await Promise.allSettled([
      creditsUtilsService.reserveCredits({
        actorUserId: 'user-1',
        amount: 3000,
        idempotencyKey: 'generation:concurrent-1',
        organizationId,
      }),
      creditsUtilsService.reserveCredits({
        actorUserId: 'user-1',
        amount: 3000,
        idempotencyKey: 'generation:concurrent-2',
        organizationId,
      }),
    ]);

    expect(
      attempts.filter((attempt) => attempt.status === 'fulfilled'),
    ).toHaveLength(1);
    const wallet = await creditsUtilsService.getWalletSnapshot(organizationId);
    expect(wallet.settled).toBe(STARTING_BALANCE);
    expect(wallet.held).toBe(3000);
    expect(wallet.available).toBe(2000);
  });

  it('settles a concurrently replayed reservation exactly once', async () => {
    const organizationId = await seedOrganizationWithBalance();
    const reservation = await creditsUtilsService.reserveCredits({
      actorUserId: 'user-1',
      amount: 1000,
      idempotencyKey: 'generation:settlement-replay',
      organizationId,
    });

    const settlements = await Promise.allSettled([
      creditsUtilsService.settleReservation({
        actualAmount: 750,
        actorUserId: 'user-1',
        description: 'generation complete',
        organizationId,
        reservationId: reservation.id,
      }),
      creditsUtilsService.settleReservation({
        actualAmount: 750,
        actorUserId: 'user-1',
        description: 'generation complete',
        organizationId,
        reservationId: reservation.id,
      }),
    ]);

    expect(
      settlements.every((settlement) => settlement.status === 'fulfilled'),
    ).toBe(true);
    const wallet = await creditsUtilsService.getWalletSnapshot(organizationId);
    expect(wallet.settled).toBe(STARTING_BALANCE - 750);
    expect(wallet.held).toBe(0);
    expect(wallet.available).toBe(STARTING_BALANCE - 750);
    const transactions = await prisma.creditTransaction.findMany({
      where: {
        isDeleted: false,
        organizationId,
        reservationId: reservation.id,
      },
    });
    expect(transactions).toHaveLength(1);
  });

  it('expires an abandoned reservation without changing settled transaction totals', async () => {
    const organizationId = await seedOrganizationWithBalance();
    const before = await prisma.creditTransaction.aggregate({
      _sum: { amount: true },
      where: { isDeleted: false, organizationId },
    });
    const reservation = await creditsUtilsService.reserveCredits({
      actorUserId: 'user-1',
      amount: 1000,
      expiresAt: new Date(Date.now() - 1_000),
      idempotencyKey: 'generation:expired',
      organizationId,
    });

    await expect(
      creditReservationService.expireDue(),
    ).resolves.toBeGreaterThanOrEqual(1);

    const wallet = await creditsUtilsService.getWalletSnapshot(organizationId);
    expect(wallet.settled).toBe(STARTING_BALANCE);
    expect(wallet.held).toBe(0);
    expect(wallet.available).toBe(STARTING_BALANCE);
    const row = await prisma.creditReservation.findFirst({
      where: { id: reservation.id, isDeleted: false, organizationId },
    });
    expect(row?.status).toBe(CreditReservationStatus.EXPIRED);
    const after = await prisma.creditTransaction.aggregate({
      _sum: { amount: true },
      where: { isDeleted: false, organizationId },
    });
    expect(after._sum.amount).toBe(before._sum.amount);
  });
});
