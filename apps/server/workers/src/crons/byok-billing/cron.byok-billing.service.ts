import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { ByokBillingService } from '@api/services/byok-billing/byok-billing.service';
import { ByokBillingStatus, SubscriptionTier } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class CronByokBillingService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly logger: LoggerService,
    private readonly byokBillingService: ByokBillingService,
    private readonly organizationSettingsService: OrganizationSettingsService,
  ) {}

  /**
   * Monthly BYOK billing cron — 1st of each month, 2am UTC
   * Aggregates BYOK usage for the previous month and creates Stripe invoices.
   */
  @Cron('0 2 1 * *')
  async processMonthlyByokBilling() {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} starting monthly BYOK billing`);

    let invoicedCount = 0;
    let skippedCount = 0;
    let rolledOverCount = 0;
    let failedCount = 0;
    let totalRevenueCents = 0;

    try {
      // Find all BYOK organizations with Stripe customer IDs
      const byokOrgs = await this.organizationSettingsService.findAll(
        [
          {
            $match: {
              byokBillingStatus: { $ne: ByokBillingStatus.SUSPENDED },
              isDeleted: { $ne: true },
              subscriptionTier: SubscriptionTier.BYOK,
            },
          },
        ],
        { pagination: false },
      );

      const organizations = byokOrgs?.docs || [];

      this.logger.log(
        `${url} found ${organizations.length} BYOK orgs to process`,
      );

      for (const orgSettings of organizations) {
        const organizationId = orgSettings.organization?.toString();

        if (!organizationId) {
          skippedCount++;
          continue;
        }

        try {
          const result =
            await this.byokBillingService.createByokInvoice(organizationId);

          if (result.skipped) {
            skippedCount++;
          } else if (result.rolledOver) {
            rolledOverCount++;
          } else if (result.invoiceId) {
            invoicedCount++;
            totalRevenueCents += result.feeAmount;
          }
        } catch (error: unknown) {
          failedCount++;
          this.logger.error(`${url} failed for org ${organizationId}`, error);
        }
      }

      this.logger.log(`${url} completed`, {
        failedCount,
        invoicedCount,
        rolledOverCount,
        skippedCount,
        totalOrgs: organizations.length,
        totalRevenueCents,
        totalRevenueDollars: (totalRevenueCents / 100).toFixed(2),
      });
    } catch (error: unknown) {
      this.logger.error(`${url} critical failure`, error);
    }
  }
}
