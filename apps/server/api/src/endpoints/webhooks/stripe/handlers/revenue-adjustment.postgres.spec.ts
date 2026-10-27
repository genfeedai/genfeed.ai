import { randomUUID } from 'node:crypto';
import { EconomicsService } from '@api/endpoints/admin/economics/economics.service';
import { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import type { StripePaymentRevenueReferenceService } from '@api/services/integrations/stripe/services/stripe-payment-revenue-reference.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BillingRevenueSource } from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

// Explicit opt-in only: an isolated migrated database, never DATABASE_URL.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;
const NET_MINOR = 2_900;
const GROSS_MINOR = 3_480;
const FEE_MINOR = 131;

describe.skipIf(!connectionString)(
  'revenue ledger refunds and disputes (PostgreSQL)',
  () => {
    const prisma = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    const database = () => {
      if (!prisma) throw new Error('A test database URL is required');
      return prisma;
    };
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;
    const unused = Object.create(null);
    const paymentReferences = { resolveProcessingFee: vi.fn() };
    let organizationId: string;
    let saleId: string;
    let suffix: string;
    let service: StripeWebhookSupportService;

    function adjust(
      adjustmentId: string,
      adjustedGrossMinor: number,
      source: BillingRevenueSource.REFUND | BillingRevenueSource.DISPUTE,
      originalStripeObjectId = saleId,
    ) {
      return service.recordRevenueAdjustment({
        adjustedGrossMinor,
        adjustmentId,
        occurredAt: new Date(),
        originalGrossMinor: GROSS_MINOR,
        originalStripeObjectId,
        source,
      });
    }

    async function adjustmentRows(adjustmentId: string) {
      return database().billingRevenueEvent.findMany({
        orderBy: { amountMinor: 'asc' },
        where: { stripeObjectId: { startsWith: `${adjustmentId}:` } },
      });
    }

    beforeEach(async () => {
      paymentReferences.resolveProcessingFee.mockResolvedValue({
        currency: 'USD',
        feeMinor: FEE_MINOR,
      });
      suffix = randomUUID().slice(0, 8);
      const userId = `usr_${suffix}`;
      organizationId = `org_${suffix}`;
      saleId = `cs_${suffix}`;
      const db = database();
      await db.user.create({ data: { handle: userId, id: userId } });
      await db.billingAccount.create({ data: { id: `ba_${suffix}` } });
      await db.organization.create({
        data: {
          billingAccountId: `ba_${suffix}`,
          id: organizationId,
          label: organizationId,
          slug: organizationId,
          userId,
        },
      });
      await db.billingRevenueEvent.create({
        data: {
          amountMinor: NET_MINOR,
          currency: 'usd',
          occurredAt: new Date(),
          organizationId,
          source: BillingRevenueSource.CREDIT_PURCHASE,
          stripeObjectId: saleId,
          userId,
        },
      });
      service = new StripeWebhookSupportService(
        unused,
        unused,
        unused,
        logger,
        database() as unknown as PrismaService,
        unused,
        unused,
        unused,
        unused,
        unused,
        unused,
        unused,
        unused,
        paymentReferences as unknown as StripePaymentRevenueReferenceService,
      );
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it('takes the net-of-tax share of a full refund out of revenue', async () => {
      await adjust(
        `refund:ch_1_${suffix}`,
        GROSS_MINOR,
        BillingRevenueSource.REFUND,
      );

      const rows = await adjustmentRows(`refund:ch_1_${suffix}`);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        amountMinor: -NET_MINOR,
        organizationId,
        source: BillingRevenueSource.REFUND,
      });
    });

    it('books only the part of a cumulative refund not already taken out', async () => {
      await adjust(`refund:ch_2_${suffix}`, 1_740, BillingRevenueSource.REFUND);
      await adjust(
        `refund:ch_2_${suffix}`,
        GROSS_MINOR,
        BillingRevenueSource.REFUND,
      );

      const rows = await adjustmentRows(`refund:ch_2_${suffix}`);
      expect(rows.map((row) => row.amountMinor)).toEqual([-1_450, -1_450]);
    });

    it('records nothing twice when Stripe redelivers an event', async () => {
      await adjust(`refund:ch_3_${suffix}`, 1_740, BillingRevenueSource.REFUND);
      await adjust(`refund:ch_3_${suffix}`, 1_740, BillingRevenueSource.REFUND);
      await adjust(
        `refund:ch_3_${suffix}`,
        GROSS_MINOR,
        BillingRevenueSource.REFUND,
      );
      await adjust(`refund:ch_3_${suffix}`, 1_740, BillingRevenueSource.REFUND);
      await adjust(
        `refund:ch_3_${suffix}`,
        GROSS_MINOR,
        BillingRevenueSource.REFUND,
      );

      const rows = await adjustmentRows(`refund:ch_3_${suffix}`);
      expect(rows.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(
        -NET_MINOR,
      );
      expect(rows).toHaveLength(2);
    });

    it('ignores a smaller cumulative refund that arrives after a larger one', async () => {
      await adjust(
        `refund:ch_4_${suffix}`,
        GROSS_MINOR,
        BillingRevenueSource.REFUND,
      );
      await adjust(`refund:ch_4_${suffix}`, 1_740, BillingRevenueSource.REFUND);

      const rows = await adjustmentRows(`refund:ch_4_${suffix}`);
      expect(rows.map((row) => row.amountMinor)).toEqual([-NET_MINOR]);
    });

    it('never takes out more than the payment, even for a dispute larger than the charge', async () => {
      await adjust(
        `dispute:dp_1_${suffix}`,
        GROSS_MINOR * 2,
        BillingRevenueSource.DISPUTE,
      );

      const rows = await adjustmentRows(`dispute:dp_1_${suffix}`);
      expect(rows.map((row) => row.amountMinor)).toEqual([-NET_MINOR]);
      expect(rows[0]?.source).toBe(BillingRevenueSource.DISPUTE);
    });

    it('serializes concurrent events for one charge so the total stays exact', async () => {
      await Promise.all([
        adjust(`refund:ch_5_${suffix}`, 1_740, BillingRevenueSource.REFUND),
        adjust(
          `refund:ch_5_${suffix}`,
          GROSS_MINOR,
          BillingRevenueSource.REFUND,
        ),
      ]);

      const rows = await adjustmentRows(`refund:ch_5_${suffix}`);
      expect(rows.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(
        -NET_MINOR,
      );
    });

    it('leaves the ledger alone for a payment it never recorded', async () => {
      await adjust(
        `refund:ch_6_${suffix}`,
        GROSS_MINOR,
        BillingRevenueSource.REFUND,
        'cs_unknown',
      );

      expect(await adjustmentRows(`refund:ch_6_${suffix}`)).toEqual([]);
    });

    it('takes the Stripe fee out of revenue once, however often the payment is replayed', async () => {
      const fee = () =>
        service.recordProcessingFee({
          occurredAt: new Date(),
          organizationId,
          payment: { paymentIntentId: `pi_${suffix}` },
          revenueObjectId: saleId,
          userId: null,
        });
      await fee();
      await fee();

      const rows = await database().billingRevenueEvent.findMany({
        where: { stripeObjectId: `fee:${saleId}` },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        amountMinor: -FEE_MINOR,
        currency: 'usd',
        organizationId,
        source: BillingRevenueSource.PROCESSING_FEE,
      });
    });

    it('nets fees out of the Economics revenue report without counting them as payments', async () => {
      const economics = new EconomicsService(
        database() as unknown as PrismaService,
      );
      const today = new Date().toISOString().slice(0, 10);
      const before = await economics.getRevenue({ from: today, to: today });

      await service.recordProcessingFee({
        occurredAt: new Date(),
        organizationId,
        payment: { paymentIntentId: `pi_${suffix}` },
        revenueObjectId: saleId,
      });
      const after = await economics.getRevenue({ from: today, to: today });

      expect(after.totals.revenueUsd - before.totals.revenueUsd).toBeCloseTo(
        -1.31,
        2,
      );
      expect(after.totals.events).toBe(before.totals.events);
    });

    it('nets refunds out of the Economics revenue report without counting them as payments', async () => {
      const economics = new EconomicsService(
        database() as unknown as PrismaService,
      );
      const today = new Date().toISOString().slice(0, 10);
      const before = await economics.getRevenue({ from: today, to: today });

      await adjust(`refund:ch_7_${suffix}`, 1_740, BillingRevenueSource.REFUND);
      const after = await economics.getRevenue({ from: today, to: today });

      expect(after.totals.revenueUsd - before.totals.revenueUsd).toBeCloseTo(
        -14.5,
        2,
      );
      expect(after.totals.events).toBe(before.totals.events);
      const refunds = after.sources.find(
        (row) => row.source === BillingRevenueSource.REFUND,
      );
      expect(refunds?.revenueUsd).toBeLessThan(0);
      expect(after.daily.at(-1)?.adjustmentsUsd).toBeLessThan(0);
    });
  },
);
