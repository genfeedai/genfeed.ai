import { randomUUID } from 'node:crypto';
import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { StoryboardAssetBibleService } from '@api/collections/content-runs/services/storyboard-asset-bible.service';
import { storyboardStoredRunConfigSchema } from '@api/collections/content-runs/services/storyboard-imported-run-state.schema';
import { StoryboardJournalSweepService } from '@api/collections/content-runs/services/storyboard-journal-sweep.service';
import {
  projectStoryboardRun,
  StoryboardRunStoreService,
  storyboardJson,
} from '@api/collections/content-runs/services/storyboard-run-store.service';
import { StoryboardShotRendersService } from '@api/collections/content-runs/services/storyboard-shot-renders.service';
import { storyboardStillInput } from '@api/collections/content-runs/services/storyboard-still-state';
import { StoryboardStillsService } from '@api/collections/content-runs/services/storyboard-stills.service';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { INGREDIENT_PROCESSING_TIMEOUT_ERROR } from '@api/collections/ingredients/constants/processing-timeout.constants';
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  CreditReservationStatus,
  CreditTransactionCategory,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import type { StoryboardNativeRunConfig } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import {
  DRAFT_GENERATION_CONFIG,
  GENERATION_POOL_WORKLOAD_TYPE,
} from '@genfeedai/contracts/constants';
import { PrismaClient } from '@genfeedai/prisma';
import { createTenantGuardExtension } from '@libs/prisma/tenant-guard.extension';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
vi.mock('@sentry/nestjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/nestjs')>()),
  captureException: vi.fn(),
}));

// Explicit opt-in only: a migrated, disposable database, never DATABASE_URL.
const connectionString = process.env.CREDIT_BALANCE_TEST_DATABASE_URL;
if (connectionString) {
  const url = new URL(connectionString);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname))
    throw new Error('Storyboard sweep tests need a loopback database.');
}

const HELD_CREDITS = 4;
const STARTING_BALANCE = 100;

/**
 * Real Postgres, real run store and real credit ledger: a paid storyboard
 * render is started, the creator closes the page, the provider finishes, and
 * only the backend sweep runs (#9651). The ledger and the run document are
 * read back from the database, never from a mock.
 */
describe.skipIf(!connectionString)(
  'storyboard journal sweep settles paid operations without an open page (PostgreSQL)',
  () => {
    const db = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    function database() {
      if (!db) throw new Error('CREDIT_BALANCE_TEST_DATABASE_URL is required');
      return db;
    }
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    let organizationId: string;
    let billingAccountId: string;
    let brandId: string;
    let userId: string;
    let reservations: CreditReservationService;
    let credits: CreditsUtilsService;
    let store: StoryboardRunStoreService;
    let sweep: StoryboardJournalSweepService;
    const runIds: string[] = [];

    beforeEach(async () => {
      const client = database();
      const suffix = randomUUID();
      organizationId = `sweep-org-${suffix}`;
      billingAccountId = `sweep-wallet-${suffix}`;
      brandId = `sweep-brand-${suffix}`;
      userId = `sweep-user-${suffix}`;
      runIds.length = 0;
      await client.user.create({ data: { id: userId, handle: userId } });
      await client.billingAccount.create({ data: { id: billingAccountId } });
      await client.organization.create({
        data: {
          id: organizationId,
          userId,
          label: organizationId,
          slug: organizationId,
          billingAccountId,
        },
      });
      await client.brand.create({
        data: {
          id: brandId,
          userId,
          organizationId,
          label: brandId,
          slug: brandId,
        },
      });
      await client.creditBalance.create({
        data: {
          organizationId,
          billingAccountId,
          balance: STARTING_BALANCE,
          heldAmount: 0,
        },
      });
      const prisma = client.$extends(
        createTenantGuardExtension({
          isCloud: true,
          tenantModelNames: new Set([
            'CreditReservation',
            'CreditBalance',
            'CreditTransaction',
            'Ingredient',
          ]),
        }),
      ) as unknown as PrismaService;
      const balance = new CreditBalanceService(prisma, logger as never);
      const ledger = new CreditTransactionsService(
        prisma,
        logger as never,
        balance,
        { invalidate: vi.fn() } as never,
      );
      reservations = new CreditReservationService(
        prisma,
        logger as never,
        balance,
        ledger,
        new TransactionUtil(prisma, logger as never),
      );
      credits = new CreditsUtilsService(
        logger as never,
        prisma,
        new BillingAccountsService(prisma, logger as never),
        balance,
        reservations,
        ledger,
        {} as never,
        { emit: vi.fn() } as never,
        { invalidateForOrganization: vi.fn() } as never,
        new TransactionUtil(prisma, logger as never),
        {
          assertTrialActive: vi.fn(),
          isTrialExpired: vi.fn().mockResolvedValue(false),
        } as never,
      );
      store = new StoryboardRunStoreService(prisma);
      const unused = {} as never;
      sweep = new StoryboardJournalSweepService(
        prisma,
        new StoryboardStillsService(
          prisma,
          store,
          unused,
          unused,
          unused,
          unused,
          credits,
          logger as never,
        ),
        new StoryboardShotRendersService(
          prisma,
          store,
          unused,
          unused,
          unused,
          unused,
          unused,
          unused,
          credits,
          logger as never,
        ),
        new StoryboardAssetBibleService(
          prisma,
          store,
          unused,
          unused,
          unused,
          unused,
          unused,
          unused,
          credits,
          logger as never,
        ),
        logger as never,
      );
    });

    afterEach(async () => {
      const client = database();
      await client.contentRun.deleteMany({ where: { organizationId } });
      await client.creditTransaction.deleteMany({ where: { organizationId } });
      await client.creditReservation.deleteMany({ where: { organizationId } });
      await client.ingredient.deleteMany({ where: { organizationId } });
      await client.metadata.deleteMany({
        where: { label: { startsWith: organizationId } },
      });
      await client.creditBalance.deleteMany({ where: { billingAccountId } });
      await client.brand.deleteMany({ where: { id: brandId } });
      await client.organization.deleteMany({ where: { id: organizationId } });
      await client.billingAccount.deleteMany({
        where: { id: billingAccountId },
      });
      await client.user.deleteMany({ where: { id: userId } });
    });

    afterAll(async () => {
      await db?.$disconnect();
    });

    function plan(): StoryboardNativeRunConfig['plan'] {
      return {
        videoModelKey: null,
        title: 'Launch',
        logline: '',
        format: '9:16',
        runtimeBudgetSeconds: 10,
        styleReferenceAssetIds: [],
        cast: [],
        shots: [
          {
            id: 'shot-1',
            ordinal: 1,
            action: 'Mia opens the cafe door.',
            onScreenSpeaker: false,
            durationSeconds: 5,
            stillFreshness: 'generating',
            transition: 'cut',
          },
        ],
      };
    }

    /** A placeholder the provider has (or has not) accepted, plus its hold. */
    async function placeholder(
      category: IngredientCategory,
      input: { status: IngredientStatus; isAccepted: boolean },
    ) {
      const id = `sweep-asset-${randomUUID()}`;
      const metadata = await database().metadata.create({
        data: {
          label: `${organizationId}-${id}`,
          extension: category === IngredientCategory.VIDEO ? 'MP4' : 'PNG',
          ...(input.isAccepted ? { externalId: `provider-${id}` } : {}),
        },
      });
      await database().ingredient.create({
        data: {
          id,
          organizationId,
          brandId,
          userId,
          category,
          status: input.status,
          s3Key: `${id}.media`,
          metadataId: metadata.id,
        },
      });
      return id;
    }

    async function hold(
      workloadId: string,
      expiresAt = new Date(Date.now() + 60 * 60_000),
    ) {
      return credits.reserveCredits({
        organizationId,
        actorUserId: userId,
        brandId,
        amount: HELD_CREDITS,
        description: 'Storyboard sweep fixture',
        expiresAt,
        idempotencyKey: `${GENERATION_POOL_WORKLOAD_TYPE}:${workloadId}`,
        source: ActivitySource.SCRIPT,
        workloadId,
        workloadType: GENERATION_POOL_WORKLOAD_TYPE,
      });
    }

    function isoAgo(minutes: number) {
      return new Date(Date.now() - minutes * 60_000).toISOString();
    }

    /** A run the creator left with one paid sketch still in flight. */
    async function stillRun(input: {
      assetId: string;
      reservationId: string;
      updatedMinutesAgo?: number;
      runId?: string;
    }) {
      const runPlan = plan();
      const operationId = randomUUID();
      const config = storyboardStoredRunConfigSchema.parse({
        origin: 'native',
        contract: 'storyboard-run',
        version: 1,
        revision: 4,
        state: 'storyboard',
        clientRequestId: randomUUID(),
        createdByUserId: userId,
        submittedInputHash: 'a'.repeat(64),
        sourceSnapshot: {
          selector: { kind: 'brief', brief: 'Launch the new bottle.' },
          capturedAt: '2026-10-14T12:00:00.000Z',
        },
        plan: runPlan,
        stillOperations: [
          {
            version: 1,
            operationId,
            shotId: 'shot-1',
            actorUserId: userId,
            modelKey: DRAFT_GENERATION_CONFIG.draftModelKey,
            credits: HELD_CREDITS,
            billingMode: 'platform',
            fingerprint: storyboardStillInput(runPlan, 'shot-1').fingerprint,
            prompt: 'Mia opens the cafe door.',
            referenceAssetIds: [],
            aspectRatio: '9:16',
            createdAt: isoAgo(30),
            updatedAt: isoAgo(input.updatedMinutesAgo ?? 1),
            state: 'submitted',
            assetId: input.assetId,
            reservationId: input.reservationId,
            billing: 'reserved',
          },
        ],
      });
      const row = await database().contentRun.create({
        data: {
          id: input.runId ?? randomUUID(),
          organizationId,
          brandId,
          config: storyboardJson(config),
        },
      });
      runIds.push(row.id);
      return { runId: row.id, operationId };
    }

    /** A run with one paid shot render or asset image in flight. */
    async function journalRun(
      kind: 'shotRenderOperations' | 'assetOperations',
      input: {
        assetId: string;
        reservationId: string;
        updatedMinutesAgo?: number;
      },
    ) {
      const common = {
        version: 1,
        operationId: randomUUID(),
        actorUserId: userId,
        credits: HELD_CREDITS,
        billingMode: 'platform',
        referenceAssetIds: [],
        aspectRatio: '9:16',
        createdAt: isoAgo(30),
        updatedAt: isoAgo(input.updatedMinutesAgo ?? 1),
        state: 'submitted',
        assetId: input.assetId,
        reservationId: input.reservationId,
        billing: 'reserved',
      };
      const operation =
        kind === 'shotRenderOperations'
          ? {
              ...common,
              shotId: 'shot-1',
              stage: 'draft',
              modelKey: 'fixture-video-model',
              inputFingerprint: 'b'.repeat(64),
              prompt: 'Mia opens the cafe door.',
              durationSeconds: 5,
              isAudioEnabled: false,
            }
          : {
              ...common,
              entryId: 'entry-1',
              action: 'variants',
              modelKey: 'fixture-image-model',
              prompt: 'Mia, front view.',
            };
      const config = storyboardStoredRunConfigSchema.parse({
        origin: 'native',
        contract: 'storyboard-run',
        version: 1,
        revision: 4,
        state: 'approved',
        approvedRevision: 4,
        clientRequestId: randomUUID(),
        createdByUserId: userId,
        submittedInputHash: 'a'.repeat(64),
        sourceSnapshot: {
          selector: { kind: 'brief', brief: 'Launch the new bottle.' },
          capturedAt: '2026-10-14T12:00:00.000Z',
        },
        plan: plan(),
        [kind]: [operation],
      });
      const row = await database().contentRun.create({
        data: {
          id: randomUUID(),
          organizationId,
          brandId,
          config: storyboardJson(config),
        },
      });
      return row.id;
    }

    async function wallet() {
      const row = await database().creditBalance.findFirstOrThrow({
        where: { billingAccountId },
      });
      return { balance: row.balance, held: row.heldAmount };
    }

    async function hold_(reservationId: string) {
      return database().creditReservation.findFirstOrThrow({
        where: { id: reservationId },
      });
    }

    async function deductions() {
      return database().creditTransaction.findMany({
        where: {
          organizationId,
          category: CreditTransactionCategory.DEDUCT,
        },
      });
    }

    /** What the creator sees when the run is next opened. */
    async function reopen(runId: string) {
      const { record, config } = await store.read(
        organizationId,
        brandId,
        runId,
      );
      return {
        run: projectStoryboardRun(record),
        shot: config.plan.shots[0],
        operation: config.stillOperations?.[0],
      };
    }

    it('charges a rendered still once, and the next open shows it', async () => {
      const assetId = await placeholder(IngredientCategory.IMAGE, {
        status: IngredientStatus.GENERATED,
        isAccepted: true,
      });
      const reservation = await hold(`still-${randomUUID()}`);
      const { runId } = await stillRun({
        assetId,
        reservationId: reservation.id,
      });
      expect(await wallet()).toEqual({
        balance: STARTING_BALANCE,
        held: HELD_CREDITS,
      });

      const result = await sweep.sweep();

      expect(result).toEqual({ runCount: 1, failedCount: 0 });
      expect((await hold_(reservation.id)).status).toBe(
        CreditReservationStatus.SETTLED,
      );
      expect(await wallet()).toEqual({
        balance: STARTING_BALANCE - HELD_CREDITS,
        held: 0,
      });
      expect(await deductions()).toHaveLength(1);
      const { shot, operation } = await reopen(runId);
      expect(shot).toMatchObject({
        stillAssetId: assetId,
        stillFreshness: 'fresh',
      });
      expect(operation).toMatchObject({ state: 'ready', billing: 'settled' });

      // The generic expiry sweep and a second pass leave the charge alone.
      await reservations.expireDue(new Date(Date.now() + 3 * 60 * 60_000));
      expect(await sweep.sweep()).toEqual({ runCount: 0, failedCount: 0 });
      expect(await wallet()).toEqual({
        balance: STARTING_BALANCE - HELD_CREDITS,
        held: 0,
      });
      expect(await deductions()).toHaveLength(1);
    });

    it('refunds a failed still without charging, and the next open says so (#7500)', async () => {
      const assetId = await placeholder(IngredientCategory.IMAGE, {
        status: IngredientStatus.FAILED,
        isAccepted: true,
      });
      const reservation = await hold(`still-${randomUUID()}`);
      const { runId } = await stillRun({
        assetId,
        reservationId: reservation.id,
      });

      await sweep.sweep();

      expect((await hold_(reservation.id)).status).toBe(
        CreditReservationStatus.RELEASED,
      );
      expect(await wallet()).toEqual({ balance: STARTING_BALANCE, held: 0 });
      expect(await deductions()).toHaveLength(0);
      const { shot, operation } = await reopen(runId);
      expect(shot).toMatchObject({ stillFreshness: 'failed' });
      expect(operation).toMatchObject({ state: 'failed', billing: 'released' });
    });

    it('charges a render that finished after the hold passed its expiry but before the generic sweep', async () => {
      const assetId = await placeholder(IngredientCategory.IMAGE, {
        status: IngredientStatus.GENERATED,
        isAccepted: true,
      });
      const reservation = await hold(
        `still-${randomUUID()}`,
        new Date(Date.now() - 60_000),
      );
      await stillRun({ assetId, reservationId: reservation.id });

      // The cron settles storyboards first, then expires what is left.
      await sweep.sweep();
      await reservations.expireDue();

      expect((await hold_(reservation.id)).status).toBe(
        CreditReservationStatus.SETTLED,
      );
      expect(await wallet()).toEqual({
        balance: STARTING_BALANCE - HELD_CREDITS,
        held: 0,
      });
    });

    it('never charges a hold that expiry already released', async () => {
      const assetId = await placeholder(IngredientCategory.IMAGE, {
        status: IngredientStatus.GENERATED,
        isAccepted: true,
      });
      const reservation = await hold(
        `still-${randomUUID()}`,
        new Date(Date.now() - 60_000),
      );
      const { runId } = await stillRun({
        assetId,
        reservationId: reservation.id,
      });
      await reservations.expireDue();

      await sweep.sweep();

      expect(await wallet()).toEqual({ balance: STARTING_BALANCE, held: 0 });
      expect(await deductions()).toHaveLength(0);
      expect((await reopen(runId)).operation).toMatchObject({
        state: 'ready',
        billing: 'released',
      });
    });

    it('fails an abandoned dispatch with the timeout marker and releases its hold', async () => {
      const assetId = await placeholder(IngredientCategory.IMAGE, {
        status: IngredientStatus.PROCESSING,
        isAccepted: false,
      });
      const reservation = await hold(`still-${randomUUID()}`);
      const { runId } = await stillRun({
        assetId,
        reservationId: reservation.id,
        updatedMinutesAgo: 20,
      });

      await sweep.sweep();

      const asset = await database().ingredient.findFirstOrThrow({
        where: { id: assetId },
      });
      // Only this marker lets a late provider success finalize the asset.
      expect(asset).toMatchObject({
        status: IngredientStatus.FAILED,
        generationError: INGREDIENT_PROCESSING_TIMEOUT_ERROR,
      });
      expect((await hold_(reservation.id)).status).toBe(
        CreditReservationStatus.RELEASED,
      );
      expect(await wallet()).toEqual({ balance: STARTING_BALANCE, held: 0 });
      expect((await reopen(runId)).shot).toMatchObject({
        stillFreshness: 'failed',
      });
    });

    it('leaves a render the provider is still working on held and untouched', async () => {
      const assetId = await placeholder(IngredientCategory.IMAGE, {
        status: IngredientStatus.PROCESSING,
        isAccepted: true,
      });
      const reservation = await hold(`still-${randomUUID()}`);
      const { runId } = await stillRun({
        assetId,
        reservationId: reservation.id,
      });

      await sweep.sweep();

      expect((await hold_(reservation.id)).status).toBe(
        CreditReservationStatus.RESERVED,
      );
      expect(await wallet()).toEqual({
        balance: STARTING_BALANCE,
        held: HELD_CREDITS,
      });
      expect((await reopen(runId)).operation).toMatchObject({
        state: 'submitted',
        billing: 'reserved',
      });
    });

    it('charges a finished shot render and fails an abandoned one with the timeout marker', async () => {
      const rendered = await placeholder(IngredientCategory.VIDEO, {
        status: IngredientStatus.GENERATED,
        isAccepted: true,
      });
      const abandoned = await placeholder(IngredientCategory.VIDEO, {
        status: IngredientStatus.PROCESSING,
        isAccepted: false,
      });
      const renderedHold = await hold(`render-${randomUUID()}`);
      const abandonedHold = await hold(`render-${randomUUID()}`);
      const renderedRun = await journalRun('shotRenderOperations', {
        assetId: rendered,
        reservationId: renderedHold.id,
      });
      await journalRun('shotRenderOperations', {
        assetId: abandoned,
        reservationId: abandonedHold.id,
        updatedMinutesAgo: 30,
      });

      await sweep.sweep();

      expect((await hold_(renderedHold.id)).status).toBe(
        CreditReservationStatus.SETTLED,
      );
      expect((await hold_(abandonedHold.id)).status).toBe(
        CreditReservationStatus.RELEASED,
      );
      expect(
        await database().ingredient.findFirstOrThrow({
          where: { id: abandoned },
        }),
      ).toMatchObject({
        status: IngredientStatus.FAILED,
        generationError: INGREDIENT_PROCESSING_TIMEOUT_ERROR,
      });
      expect(await wallet()).toEqual({
        balance: STARTING_BALANCE - HELD_CREDITS,
        held: 0,
      });
      const { config } = await store.read(organizationId, brandId, renderedRun);
      expect(config.shotRenderOperations?.[0]).toMatchObject({
        state: 'ready',
        billing: 'settled',
      });
    });

    it('releases the hold of an asset image that failed', async () => {
      const failed = await placeholder(IngredientCategory.IMAGE, {
        status: IngredientStatus.FAILED,
        isAccepted: true,
      });
      const failedHold = await hold(`asset-${randomUUID()}`);
      const runId = await journalRun('assetOperations', {
        assetId: failed,
        reservationId: failedHold.id,
      });

      await sweep.sweep();

      expect((await hold_(failedHold.id)).status).toBe(
        CreditReservationStatus.RELEASED,
      );
      expect(await wallet()).toEqual({ balance: STARTING_BALANCE, held: 0 });
      const { config } = await store.read(organizationId, brandId, runId);
      expect(config.assetOperations?.[0]).toMatchObject({
        state: 'failed',
        billing: 'released',
      });
    });

    it('moves past a run the provider is still working on instead of revisiting it', async () => {
      // `a` stays live and sorts first: without the cursor every page of one
      // run would return it again and `b` would never be reached.
      const working = await placeholder(IngredientCategory.IMAGE, {
        status: IngredientStatus.PROCESSING,
        isAccepted: true,
      });
      const finished = await placeholder(IngredientCategory.IMAGE, {
        status: IngredientStatus.GENERATED,
        isAccepted: true,
      });
      const workingHold = await hold(`still-${randomUUID()}`);
      const finishedHold = await hold(`still-${randomUUID()}`);
      await stillRun({
        assetId: working,
        reservationId: workingHold.id,
        runId: `${organizationId}-run-a`,
      });
      await stillRun({
        assetId: finished,
        reservationId: finishedHold.id,
        runId: `${organizationId}-run-b`,
      });

      await sweep.sweep(1, 1);
      expect((await hold_(finishedHold.id)).status).toBe(
        CreditReservationStatus.RESERVED,
      );
      await sweep.sweep(1, 1);

      expect((await hold_(finishedHold.id)).status).toBe(
        CreditReservationStatus.SETTLED,
      );
      expect((await hold_(workingHold.id)).status).toBe(
        CreditReservationStatus.RESERVED,
      );
    });

    it('settles every run of a backlog longer than a page before expiry releases the due holds', async () => {
      const holds = [];
      for (let index = 0; index < 3; index += 1) {
        const assetId = await placeholder(IngredientCategory.IMAGE, {
          status: IngredientStatus.GENERATED,
          isAccepted: true,
        });
        const due = await hold(
          `still-${randomUUID()}`,
          new Date(Date.now() - 60_000),
        );
        holds.push(due.id);
        await stillRun({ assetId, reservationId: due.id });
      }

      // One run per page, three pages: the same drain the cron runs before expiry.
      await sweep.sweep(1, 3);
      await reservations.expireDue();

      for (const id of holds)
        expect((await hold_(id)).status).toBe(CreditReservationStatus.SETTLED);
      expect(await wallet()).toEqual({
        balance: STARTING_BALANCE - 3 * HELD_CREDITS,
        held: 0,
      });
    });
  },
);
