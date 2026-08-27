import {
  BillingAccountBudgetPolicy,
  BillingAccountMemberRole,
  BillingAccountOrganizationStatus,
  BillingAccountStatus,
  billingAccountRoleSatisfies,
  CreditTransactionCategory,
  parseBillingAccountMemberRole,
  parseBillingAccountOrganizationStatus,
  parseBillingAccountStatus,
  SubscriptionTier,
} from '@genfeedai/enums';
import type {
  IBillingAccount,
  IBillingAccountCapabilities,
  IBillingAccountOrganizationLink,
} from '@genfeedai/interfaces';
import {
  getOrganizationLimitForTier,
  getUpgradeTierForLimit,
} from '@genfeedai/pricing';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PlanLimitExceededException } from '@server/exceptions/business-logic.exception';
import { NotFoundException } from '@server/exceptions/not-found.exception';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

const MUTATING_ROLE = BillingAccountMemberRole.ADMINISTRATOR;
const OWNER_ROLE = BillingAccountMemberRole.OWNER;

@Injectable()
export class BillingAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async resolveForOrganization(organizationId: string) {
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, isDeleted: false },
    });
    if (!organization) {
      throw new NotFoundException('Organization');
    }

    if (organization.billingAccountId) {
      const account = await this.prisma.billingAccount.findFirst({
        where: { id: organization.billingAccountId, isDeleted: false },
      });
      if (!account) {
        throw new ConflictException('Billing account could not be resolved');
      }
      return account;
    }

    const links = await this.prisma.billingAccountOrganization.findMany({
      where: {
        isDeleted: false,
        organizationId,
        status: BillingAccountOrganizationStatus.LINKED,
      },
    });
    if (links.length > 1) {
      throw new ConflictException('Billing account could not be resolved');
    }
    if (links.length === 1) {
      const account = await this.prisma.billingAccount.findFirst({
        where: { id: links[0].billingAccountId, isDeleted: false },
      });
      if (!account) {
        throw new ConflictException('Billing account could not be resolved');
      }
      return account;
    }

    throw new NotFoundException('Billing account not found');
  }

  async ensureForOrganization(input: {
    organizationId: string;
    userId: string;
    label?: string;
    billingAccountId?: string;
    planTier?: string | null;
  }) {
    const organization = await this.prisma.organization.findFirst({
      where: { id: input.organizationId, isDeleted: false },
    });
    if (!organization) {
      throw new NotFoundException('Organization');
    }

    if (organization.billingAccountId && !input.billingAccountId) {
      return this.resolveForOrganization(input.organizationId);
    }

    if (input.billingAccountId) {
      return this.linkOrganization({
        actorUserId: input.userId,
        billingAccountId: input.billingAccountId,
        organizationId: input.organizationId,
      });
    }

    const owned = await this.prisma.billingAccountMember.findMany({
      where: {
        isDeleted: false,
        role: BillingAccountMemberRole.OWNER,
        userId: input.userId,
      },
      include: { billingAccount: true },
    });
    const liveOwned = owned.filter((row) => !row.billingAccount.isDeleted);
    if (liveOwned.length === 1) {
      const candidate = liveOwned[0].billingAccount;
      const linkedCount = await this.countLinkedOrganizations(candidate.id);
      const limit = this.organizationLimitForTier(candidate.planTier);
      if (limit === null || linkedCount < limit) {
        return this.linkOrganization({
          actorUserId: input.userId,
          billingAccountId: candidate.id,
          organizationId: input.organizationId,
        });
      }
      if (limit !== null && linkedCount >= limit) {
        throw new PlanLimitExceededException({
          currentCount: linkedCount,
          limit,
          resource: 'organizations',
          upgradeTier: getUpgradeTierForLimit(
            'organizations',
            this.parseTier(candidate.planTier),
          ),
        });
      }
    }

    const account = await this.prisma.billingAccount.create({
      data: {
        label: input.label ?? organization.label,
        planTier: input.planTier ?? null,
        status: BillingAccountStatus.UNPROVISIONED,
      },
    });

    await this.prisma.billingAccountMember.create({
      data: {
        billingAccountId: account.id,
        role: BillingAccountMemberRole.OWNER,
        userId: input.userId,
      },
    });

    return this.linkOrganization({
      actorUserId: input.userId,
      billingAccountId: account.id,
      organizationId: input.organizationId,
    });
  }

  async getSnapshot(
    organizationId: string,
    userId: string,
  ): Promise<IBillingAccount> {
    const account = await this.resolveForOrganization(organizationId);
    const callerRole = await this.findRole(account.id, userId);
    const links = await this.prisma.billingAccountOrganization.findMany({
      where: {
        billingAccountId: account.id,
        isDeleted: false,
        status: BillingAccountOrganizationStatus.LINKED,
      },
      include: { organization: true },
    });
    const wallet = await this.prisma.creditBalance.findFirst({
      where: { billingAccountId: account.id, isDeleted: false },
    });
    const settled = wallet?.balance ?? 0;
    const held = wallet?.heldAmount ?? 0;
    const usageByOrg = await this.usageByOrganization(account.id);
    const subscription = await this.prisma.subscription.findFirst({
      where: { billingAccountId: account.id, isDeleted: false },
    });
    const status = parseBillingAccountStatus(account.status);
    const linkedOrganizations: IBillingAccountOrganizationLink[] = links.map(
      (link) => ({
        budgetPolicy: this.parseBudgetPolicy(link.budgetPolicy),
        label: link.organization.label,
        monthlyBudgetCredits: link.monthlyBudgetCredits,
        organizationId: link.organizationId,
        status: parseBillingAccountOrganizationStatus(link.status),
        usage: usageByOrg.get(link.organizationId) ?? 0,
      }),
    );
    const capabilities = this.capabilitiesFor(callerRole, status);

    return {
      callerRole,
      capabilities,
      createdAt: account.createdAt.toISOString(),
      currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
      id: account.id,
      isDeleted: account.isDeleted,
      isIdentityStale: status === BillingAccountStatus.STALE,
      label: account.label,
      linkedOrganizations,
      planTier: account.planTier,
      status,
      subscriptionStatus: subscription?.status ?? null,
      updatedAt: account.updatedAt.toISOString(),
      wallet: {
        available: settled - held,
        held,
        settled,
      },
    };
  }

  async requireRole(
    billingAccountId: string,
    userId: string,
    required: BillingAccountMemberRole,
  ): Promise<BillingAccountMemberRole> {
    const role = await this.findRole(billingAccountId, userId);
    if (!role || !billingAccountRoleSatisfies(role, required)) {
      throw new ForbiddenException('Billing permission required');
    }
    return role;
  }

  async linkOrganization(input: {
    billingAccountId: string;
    organizationId: string;
    actorUserId: string;
  }) {
    const account = await this.prisma.billingAccount.findFirst({
      where: { id: input.billingAccountId, isDeleted: false },
    });
    if (!account) {
      throw new NotFoundException('BillingAccount');
    }

    await this.requireRole(account.id, input.actorUserId, MUTATING_ROLE);

    const linkedCount = await this.countLinkedOrganizations(account.id);
    const alreadyLinked =
      await this.prisma.billingAccountOrganization.findFirst({
        where: {
          billingAccountId: account.id,
          isDeleted: false,
          organizationId: input.organizationId,
          status: BillingAccountOrganizationStatus.LINKED,
        },
      });
    if (!alreadyLinked) {
      const limit = this.organizationLimitForTier(account.planTier);
      if (limit !== null && linkedCount >= limit) {
        throw new PlanLimitExceededException({
          currentCount: linkedCount,
          limit,
          resource: 'organizations',
          upgradeTier: getUpgradeTierForLimit(
            'organizations',
            this.parseTier(account.planTier),
          ),
        });
      }
    }

    if (!alreadyLinked) {
      await this.prisma.billingAccountOrganization.create({
        data: {
          billingAccountId: account.id,
          organizationId: input.organizationId,
          status: BillingAccountOrganizationStatus.LINKED,
        },
      });
    }

    await this.prisma.organization.update({
      data: { billingAccountId: account.id },
      where: { id: input.organizationId },
    });

    const orgBalance = await this.prisma.creditBalance.findFirst({
      where: { isDeleted: false, organizationId: input.organizationId },
    });
    const accountBalance = await this.prisma.creditBalance.findFirst({
      where: { billingAccountId: account.id, isDeleted: false },
    });

    if (orgBalance && accountBalance && orgBalance.id !== accountBalance.id) {
      await this.prisma.creditBalance.updateMany({
        data: {
          balance: accountBalance.balance + orgBalance.balance,
        },
        where: scopedWhere(input.organizationId, { id: accountBalance.id }),
      });
      await this.prisma.creditBalance.updateMany({
        data: { isDeleted: true },
        where: scopedWhere(input.organizationId, { id: orgBalance.id }),
      });
    } else if (orgBalance && !orgBalance.billingAccountId) {
      await this.prisma.creditBalance.updateMany({
        data: { billingAccountId: account.id },
        where: scopedWhere(input.organizationId, { id: orgBalance.id }),
      });
    } else if (!orgBalance && !accountBalance) {
      await this.prisma.creditBalance.create({
        data: {
          balance: 0,
          billingAccountId: account.id,
          heldAmount: 0,
          organizationId: input.organizationId,
          version: 0,
        },
      });
    }

    await this.prisma.customer.updateMany({
      data: { billingAccountId: account.id },
      where: { isDeleted: false, organizationId: input.organizationId },
    });
    await this.prisma.subscription.updateMany({
      data: { billingAccountId: account.id },
      where: { isDeleted: false, organizationId: input.organizationId },
    });
    await this.prisma.creditTransaction.updateMany({
      data: { billingAccountId: account.id },
      where: {
        billingAccountId: null,
        organizationId: input.organizationId,
      },
    });

    this.logger.log('Linked organization to billing account', {
      billingAccountId: account.id,
      organizationId: input.organizationId,
    });

    return account;
  }

  async detachOrganization(input: {
    billingAccountId: string;
    organizationId: string;
    actorUserId: string;
  }) {
    await this.requireRole(
      input.billingAccountId,
      input.actorUserId,
      OWNER_ROLE,
    );

    await this.prisma.billingAccountOrganization.updateMany({
      data: {
        detachedAt: new Date(),
        status: BillingAccountOrganizationStatus.DETACHED,
      },
      where: {
        billingAccountId: input.billingAccountId,
        isDeleted: false,
        organizationId: input.organizationId,
        status: BillingAccountOrganizationStatus.LINKED,
      },
    });

    const replacement = await this.prisma.billingAccount.create({
      data: {
        label: null,
        status: BillingAccountStatus.UNPROVISIONED,
      },
    });
    await this.prisma.billingAccountMember.create({
      data: {
        billingAccountId: replacement.id,
        role: BillingAccountMemberRole.OWNER,
        userId: input.actorUserId,
      },
    });
    await this.prisma.billingAccountOrganization.create({
      data: {
        billingAccountId: replacement.id,
        organizationId: input.organizationId,
        status: BillingAccountOrganizationStatus.LINKED,
      },
    });
    await this.prisma.organization.update({
      data: { billingAccountId: replacement.id },
      where: { id: input.organizationId },
    });

    const wallet = await this.prisma.creditBalance.findFirst({
      where: { billingAccountId: input.billingAccountId, isDeleted: false },
    });
    if (wallet?.organizationId === input.organizationId) {
      const remaining = await this.prisma.billingAccountOrganization.findFirst({
        where: {
          billingAccountId: input.billingAccountId,
          isDeleted: false,
          organizationId: { not: input.organizationId },
          status: BillingAccountOrganizationStatus.LINKED,
        },
      });
      await this.prisma.creditBalance.update({
        data: { organizationId: remaining?.organizationId ?? null },
        where: { id: wallet.id },
      });
    }

    await this.prisma.creditBalance.create({
      data: {
        balance: 0,
        billingAccountId: replacement.id,
        heldAmount: 0,
        organizationId: input.organizationId,
        version: 0,
      },
    });

    return replacement;
  }

  async grantRole(input: {
    billingAccountId: string;
    actorUserId: string;
    userId: string;
    role: BillingAccountMemberRole;
  }) {
    await this.requireRole(
      input.billingAccountId,
      input.actorUserId,
      OWNER_ROLE,
    );
    await this.prisma.billingAccountMember.upsert({
      create: {
        billingAccountId: input.billingAccountId,
        role: input.role,
        userId: input.userId,
      },
      update: { isDeleted: false, role: input.role },
      where: {
        billingAccountId_userId: {
          billingAccountId: input.billingAccountId,
          userId: input.userId,
        },
      },
    });
  }

  async revokeRole(input: {
    billingAccountId: string;
    actorUserId: string;
    userId: string;
  }) {
    await this.requireRole(
      input.billingAccountId,
      input.actorUserId,
      OWNER_ROLE,
    );
    if (input.actorUserId === input.userId) {
      throw new ForbiddenException(
        'Owners cannot revoke their own billing role',
      );
    }
    await this.prisma.billingAccountMember.updateMany({
      data: { isDeleted: true },
      where: {
        billingAccountId: input.billingAccountId,
        isDeleted: false,
        userId: input.userId,
      },
    });
  }

  async markStatus(billingAccountId: string, status: BillingAccountStatus) {
    await this.prisma.billingAccount.update({
      data: { status },
      where: { id: billingAccountId },
    });
  }

  async attachStripeCustomer(
    billingAccountId: string,
    stripeCustomerId: string,
  ) {
    await this.prisma.billingAccount.update({
      data: {
        status: BillingAccountStatus.ACTIVE,
        stripeCustomerId,
      },
      where: { id: billingAccountId },
    });
  }

  private async findRole(
    billingAccountId: string,
    userId: string,
  ): Promise<BillingAccountMemberRole | null> {
    const member = await this.prisma.billingAccountMember.findFirst({
      where: { billingAccountId, isDeleted: false, userId },
    });
    return parseBillingAccountMemberRole(member?.role);
  }

  private capabilitiesFor(
    role: BillingAccountMemberRole | null,
    status: BillingAccountStatus,
  ): IBillingAccountCapabilities {
    const canAdmin = billingAccountRoleSatisfies(role, MUTATING_ROLE);
    const canOwn = billingAccountRoleSatisfies(role, OWNER_ROLE);
    const isUsable =
      status === BillingAccountStatus.ACTIVE ||
      status === BillingAccountStatus.UNPROVISIONED;
    return {
      canCheckout: canAdmin && isUsable,
      canDetachOrganization: canOwn,
      canLinkOrganization: canOwn,
      canManageBudgets: canAdmin,
      canManageMembers: canOwn,
      canOpenPortal: canAdmin && status === BillingAccountStatus.ACTIVE,
    };
  }

  private async countLinkedOrganizations(billingAccountId: string) {
    return this.prisma.billingAccountOrganization.count({
      where: {
        billingAccountId,
        isDeleted: false,
        status: BillingAccountOrganizationStatus.LINKED,
      },
    });
  }

  private async usageByOrganization(billingAccountId: string) {
    const rows = await this.prisma.creditTransaction.groupBy({
      by: ['organizationId'],
      _sum: { amount: true },
      where: {
        billingAccountId,
        category: CreditTransactionCategory.DEDUCT,
        isDeleted: false,
      },
    });
    return new Map(
      rows.map((row) => [row.organizationId, row._sum.amount ?? 0]),
    );
  }

  private organizationLimitForTier(planTier: string | null) {
    return getOrganizationLimitForTier(this.parseTier(planTier));
  }

  private parseTier(planTier: string | null): SubscriptionTier {
    const values = Object.values(SubscriptionTier);
    if (planTier && values.includes(planTier as SubscriptionTier)) {
      return planTier as SubscriptionTier;
    }
    return SubscriptionTier.FREE;
  }

  private parseBudgetPolicy(
    value: string | null,
  ): BillingAccountBudgetPolicy | null {
    if (value === BillingAccountBudgetPolicy.WARNING) {
      return BillingAccountBudgetPolicy.WARNING;
    }
    if (value === BillingAccountBudgetPolicy.HARD_LIMIT) {
      return BillingAccountBudgetPolicy.HARD_LIMIT;
    }
    return null;
  }
}
