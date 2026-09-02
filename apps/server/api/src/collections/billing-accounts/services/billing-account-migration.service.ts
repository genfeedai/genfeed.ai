import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BillingAccountMemberRole,
  BillingAccountOrganizationStatus,
  BillingAccountStatus,
} from '@genfeedai/contracts';
import type { IBillingAccountMigrationReport } from '@genfeedai/contracts/interfaces/billing';
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

    const stripeIdentityOrganizations = new Map<string, Set<string>>();
    for (const organization of organizations) {
      for (const customer of organization.customers) {
        if (!customer.stripeCustomerId) {
          continue;
        }
        const organizationIds =
          stripeIdentityOrganizations.get(customer.stripeCustomerId) ??
          new Set<string>();
        organizationIds.add(organization.id);
        stripeIdentityOrganizations.set(
          customer.stripeCustomerId,
          organizationIds,
        );
      }
    }

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
      const stripeCustomerId = customers[0]?.stripeCustomerId;
      if (
        stripeCustomerId &&
        (stripeIdentityOrganizations.get(stripeCustomerId)?.size ?? 0) > 1
      ) {
        return {
          classification: 'duplicate' as const,
          organizationId: organization.id,
          reason: 'Stripe customer identity is shared by organizations',
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
        const result = await this.prisma.$transaction(
          async (tx) => {
            const current = await tx.organization.findFirst({
              where: {
                billingAccountId: null,
                id: organization.id,
                isDeleted: false,
              },
            });
            if (!current) {
              return { attributed: 0, created: 0, linked: 0 };
            }

            const account = await tx.billingAccount.create({
              data: {
                label: organization.label,
                status: organization.customers[0]?.stripeCustomerId
                  ? BillingAccountStatus.ACTIVE
                  : BillingAccountStatus.UNPROVISIONED,
                stripeCustomerId: organization.customers[0]?.stripeCustomerId,
              },
            });
            await tx.billingAccountMember.create({
              data: {
                billingAccountId: account.id,
                role: BillingAccountMemberRole.OWNER,
                userId: current.userId,
              },
            });
            await tx.billingAccountOrganization.create({
              data: {
                billingAccountId: account.id,
                organizationId: organization.id,
                status: BillingAccountOrganizationStatus.LINKED,
              },
            });
            const linked = await tx.organization.updateMany({
              data: { billingAccountId: account.id },
              where: {
                billingAccountId: null,
                id: organization.id,
                isDeleted: false,
              },
            });
            if (linked.count !== 1) {
              throw new Error(
                'Organization billing account changed during migration',
              );
            }
            await tx.customer.updateMany({
              data: { billingAccountId: account.id },
              where: { isDeleted: false, organizationId: organization.id },
            });
            await tx.subscription.updateMany({
              data: { billingAccountId: account.id },
              where: { isDeleted: false, organizationId: organization.id },
            });
            await tx.creditBalance.updateMany({
              data: { billingAccountId: account.id },
              where: { isDeleted: false, organizationId: organization.id },
            });
            const attributed = await tx.creditTransaction.updateMany({
              data: { billingAccountId: account.id },
              where: {
                billingAccountId: null,
                isDeleted: false,
                organizationId: organization.id,
              },
            });
            return { attributed: attributed.count, created: 1, linked: 1 };
          },
          { isolationLevel: 'Serializable' },
        );
        createdAccounts += result.created;
        linkedOrganizations += result.linked;
        attributedTransactions += result.attributed;
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
