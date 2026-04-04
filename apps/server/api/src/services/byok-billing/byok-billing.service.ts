import {
  CreditTransactions,
  type CreditTransactionsDocument,
} from '@api/collections/credits/schemas/credit-transactions.schema';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { ByokBillingStatus, CreditTransactionCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Types } from 'mongoose';

interface ByokInvoiceMetadata {
  billableCredits: string;
  feePercentage: string;
  organizationId: string;
  periodEnd: string;
  periodStart: string;
  totalCredits: string;
  type: 'byok_platform_fee';
}

interface ByokUsageSummary {
  totalUsage: number;
  freeThreshold: number;
  freeRemaining: number;
  billableUsage: number;
  projectedFee: number;
  billingStatus: ByokBillingStatus;
  rollover: number;
  periodStart: Date;
  periodEnd: Date;
}

interface ByokInvoiceResult {
  organizationId: string;
  totalUsage: number;
  billableUsage: number;
  feeAmount: number;
  invoiceId: string | null;
  rolledOver: boolean;
  skipped: boolean;
}

@Injectable()
export class ByokBillingService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    @InjectModel(CreditTransactions.name, DB_CONNECTIONS.AUTH)
    private readonly creditTransactionsModel: Model<CreditTransactionsDocument>,
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly stripeService: StripeService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
  ) {}

  async aggregateByokUsage(
    organizationId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const result = await this.creditTransactionsModel.aggregate([
        {
          $match: {
            category: CreditTransactionCategory.BYOK_USAGE,
            createdAt: { $gte: startDate, $lte: endDate },
            isDeleted: { $ne: true },
            organization: new Types.ObjectId(organizationId),
          },
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: { $abs: '$amount' } },
          },
        },
      ]);

      const totalUsage = result[0]?.totalAmount || 0;

      this.loggerService.debug(`${url} aggregated`, {
        endDate,
        organizationId,
        startDate,
        totalUsage,
      });

      return totalUsage;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  calculateFee(
    totalCredits: number,
    freeThreshold: number,
    feePercentage: number,
  ): number {
    const billableCredits = Math.max(0, totalCredits - freeThreshold);
    // 1 credit = $0.01, fee is a percentage of that
    const feeInDollars = billableCredits * 0.01 * (feePercentage / 100);
    // Convert to cents for Stripe
    return Math.round(feeInDollars * 100);
  }

  async createByokInvoice(organizationId: string): Promise<ByokInvoiceResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const feePercentage =
        Number(this.configService.get('STRIPE_BYOK_FEE_PERCENTAGE')) || 5;
      const globalFreeThreshold =
        Number(this.configService.get('STRIPE_BYOK_FREE_THRESHOLD')) || 500;

      // Get org settings for rollover and threshold override
      const orgSettings = await this.organizationSettingsService.findOne({
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      });

      if (!orgSettings) {
        this.loggerService.warn(
          `${url} no orgSettings found, cannot track rollover`,
          {
            organizationId,
          },
        );
      }

      const freeThreshold =
        orgSettings?.byokFreeThresholdOverride ?? globalFreeThreshold;
      const rollover = orgSettings?.byokBillingRollover ?? 0;

      // Get subscription for Stripe customer ID
      const subscription =
        await this.subscriptionsService.findByOrganizationId(organizationId);

      if (!subscription?.stripeCustomerId) {
        this.loggerService.warn(`${url} no Stripe customer for org`, {
          organizationId,
        });
        return {
          billableUsage: 0,
          feeAmount: 0,
          invoiceId: null,
          organizationId,
          rolledOver: false,
          skipped: true,
          totalUsage: 0,
        };
      }

      // Calculate billing period (previous month) — safe across year boundaries
      const now = new Date();
      const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1);
      const periodStart = new Date(
        previousMonth.getFullYear(),
        previousMonth.getMonth(),
        1,
      );
      const periodEnd = new Date(
        now.getFullYear(),
        now.getMonth(),
        0,
        23,
        59,
        59,
        999,
      );

      // Idempotency: check for existing invoice for this org + period
      const existingInvoices = await this.stripeService.stripe.invoices.list({
        created: {
          gte: Math.floor(periodStart.getTime() / 1000),
          lte: Math.floor(periodEnd.getTime() / 1000),
        },
        customer: subscription.stripeCustomerId,
        limit: 100,
      });

      const alreadyInvoiced = existingInvoices.data.some(
        (inv) =>
          inv.metadata?.type === 'byok_platform_fee' &&
          inv.metadata?.organizationId === organizationId &&
          inv.metadata?.periodStart === periodStart.toISOString(),
      );

      if (alreadyInvoiced) {
        this.loggerService.warn(
          `${url} invoice already exists for this period`,
          {
            organizationId,
            periodStart: periodStart.toISOString(),
          },
        );
        return {
          billableUsage: 0,
          feeAmount: 0,
          invoiceId: null,
          organizationId,
          rolledOver: false,
          skipped: true,
          totalUsage: 0,
        };
      }

      // Aggregate usage for the billing period
      const totalUsage = await this.aggregateByokUsage(
        organizationId,
        periodStart,
        periodEnd,
      );

      // Calculate fee (in cents) + add rollover from previous periods
      const feeAmountCents =
        this.calculateFee(totalUsage, freeThreshold, feePercentage) + rollover;
      const billableUsage = Math.max(0, totalUsage - freeThreshold);

      if (feeAmountCents <= 0) {
        this.loggerService.log(`${url} no billable usage`, {
          freeThreshold,
          organizationId,
          totalUsage,
        });
        return {
          billableUsage: 0,
          feeAmount: 0,
          invoiceId: null,
          organizationId,
          rolledOver: false,
          skipped: true,
          totalUsage,
        };
      }

      // Stripe minimum invoice is $0.50 (50 cents)
      if (feeAmountCents < 50) {
        // Store as rollover for next period
        if (orgSettings) {
          await this.organizationSettingsService.patch(
            orgSettings._id.toString(),
            { byokBillingRollover: feeAmountCents },
          );
        } else {
          this.loggerService.warn(
            `${url} rollover lost — orgSettings missing`,
            {
              feeAmountCents,
              organizationId,
            },
          );
        }

        this.loggerService.log(`${url} below Stripe minimum, rolling over`, {
          feeAmountCents,
          organizationId,
        });

        return {
          billableUsage,
          feeAmount: feeAmountCents,
          invoiceId: null,
          organizationId,
          rolledOver: true,
          skipped: false,
          totalUsage,
        };
      }

      // Create Stripe invoice with cleanup on partial failure
      const metadata: ByokInvoiceMetadata = {
        billableCredits: String(billableUsage),
        feePercentage: String(feePercentage),
        organizationId,
        periodEnd: periodEnd.toISOString(),
        periodStart: periodStart.toISOString(),
        totalCredits: String(totalUsage),
        type: 'byok_platform_fee',
      };

      let invoiceItemId: string | undefined;

      try {
        const invoiceItem = await this.stripeService.stripe.invoiceItems.create(
          {
            amount: feeAmountCents,
            currency: 'usd',
            customer: subscription.stripeCustomerId,
            description: `BYOK platform fee (${feePercentage}%) — ${billableUsage.toLocaleString()} billable credits (${periodStart.toLocaleDateString()} - ${periodEnd.toLocaleDateString()})`,
          },
        );

        invoiceItemId = invoiceItem.id;

        // @ts-expect-error TS2769
        const invoice = await this.stripeService.stripe.invoices.create({
          auto_advance: true,
          collection_method: 'charge_automatically',
          customer: subscription.stripeCustomerId,
          metadata,
        });

        await this.stripeService.stripe.invoices.finalizeInvoice(invoice.id);

        // Reset rollover after successful invoice creation
        if (orgSettings && rollover > 0) {
          await this.organizationSettingsService.patch(
            orgSettings._id.toString(),
            { byokBillingRollover: 0 },
          );
        }

        this.loggerService.log(`${url} invoice created`, {
          billableUsage,
          feeAmountCents,
          invoiceId: invoice.id,
          invoiceItemId,
          organizationId,
          totalUsage,
        });

        return {
          billableUsage,
          feeAmount: feeAmountCents,
          invoiceId: invoice.id,
          organizationId,
          rolledOver: false,
          skipped: false,
          totalUsage,
        };
      } catch (stripeError: unknown) {
        // Clean up orphaned invoice item if it was created
        if (invoiceItemId) {
          try {
            await this.stripeService.stripe.invoiceItems.del(invoiceItemId);
            this.loggerService.warn(`${url} cleaned up orphaned invoice item`, {
              invoiceItemId,
              organizationId,
            });
          } catch (cleanupError: unknown) {
            this.loggerService.error(`${url} failed to clean up invoice item`, {
              cleanupError,
              invoiceItemId,
              organizationId,
            });
          }
        }

        throw stripeError;
      }
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, {
        error,
        organizationId,
      });
      throw error;
    }
  }

  async getByokUsageSummary(organizationId: string): Promise<ByokUsageSummary> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const feePercentage =
        Number(this.configService.get('STRIPE_BYOK_FEE_PERCENTAGE')) || 5;
      const globalFreeThreshold =
        Number(this.configService.get('STRIPE_BYOK_FREE_THRESHOLD')) || 500;

      const orgSettings = await this.organizationSettingsService.findOne({
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      });

      const freeThreshold =
        orgSettings?.byokFreeThresholdOverride ?? globalFreeThreshold;
      const rollover = orgSettings?.byokBillingRollover ?? 0;
      const billingStatus =
        (orgSettings?.byokBillingStatus as ByokBillingStatus) ??
        ByokBillingStatus.ACTIVE;

      // Current billing period (current month)
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );

      const totalUsage = await this.aggregateByokUsage(
        organizationId,
        periodStart,
        periodEnd,
      );

      const billableUsage = Math.max(0, totalUsage - freeThreshold);
      const freeRemaining = Math.max(0, freeThreshold - totalUsage);
      // Fee in dollars
      const projectedFee =
        billableUsage * 0.01 * (feePercentage / 100) + rollover / 100;

      return {
        billableUsage,
        billingStatus,
        freeRemaining,
        freeThreshold,
        periodEnd,
        periodStart,
        projectedFee: Math.round(projectedFee * 100) / 100,
        rollover,
        totalUsage,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
