import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BillingAccountStatus } from '@genfeedai/enums';
import type { IBillingAccountMigrationReport } from '@genfeedai/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class BillingAccountMigrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async dryRun(): Promise<IBillingAccountMigrationReport> {
    return this.run({ dryRun: true });
  }

  async applyUnambiguous(): Promise<IBillingAccountMigrationReport> {
    return this.run({ dryRun: false });
  }

  private async run(options: {
    dryRun: boolean;
  }): Promise<IBillingAccountMigrationReport> {
    const organizations = await this.prisma.organization.findMany({
      where: { isDeleted: false },
      include: {
        customers: { where: { isDeleted: false } },
        subscriptions: { where: { isDeleted: false } },
      },
    });

    const classified = organizations.map((organization) => {
      const customers = organization.customers;
      const subscriptions = organization.subscriptions;
      if (customers.length > 1 || subscriptions.length > 1) {
        return {
          classification: 'duplicate' as const,
          organizationId: organization.id,
          reason: 'Multiple active customer or subscription rows',
        };
      }
      if (!organization.billingAccountId) {
        return {
          classification: 'missing' as const,
          organizationId: organization.id,
          reason: 'Organization has no billing account',
        };
      }
      return {
        classification: 'unambiguous' as const,
        organizationId: organization.id,
        reason: 'One organization, one billing identity',
      };
    });

    let createdAccounts = 0;
    let linkedOrganizations = 0;
    let attributedTransactions = 0;

    if (!options.dryRun) {
      for (const row of classified.filter(
        (item) => item.classification === 'missing',
      )) {
        const organization = organizations.find(
          (item) => item.id === row.organizationId,
        );
        if (!organization) {
          continue;
        }
        const account = await this.prisma.billingAccount.create({
          data: {
            label: organization.label,
            status: organization.customers[0]?.stripeCustomerId
              ? BillingAccountStatus.ACTIVE
              : BillingAccountStatus.UNPROVISIONED,
            stripeCustomerId: organization.customers[0]?.stripeCustomerId,
          },
        });
        await this.prisma.organization.update({
          data: { billingAccountId: account.id },
          where: { id: organization.id },
        });
        createdAccounts += 1;
        linkedOrganizations += 1;
        const attributed = await this.prisma.creditTransaction.updateMany({
          data: { billingAccountId: account.id },
          where: { billingAccountId: null, organizationId: organization.id },
        });
        attributedTransactions += attributed.count;
      }
    }

    const report: IBillingAccountMigrationReport = {
      attributedTransactions,
      classified,
      createdAccounts,
      dryRun: options.dryRun,
      linkedOrganizations,
      quarantined: classified.filter(
        (item) => item.classification !== 'unambiguous',
      ).length,
    };

    this.logger.log('Billing account migration classified identities', {
      dryRun: options.dryRun,
      quarantined: report.quarantined,
      total: classified.length,
    });

    return report;
  }
}
