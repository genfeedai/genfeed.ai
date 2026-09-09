import { SERVER_TOKENS } from '@api/server.dependencies';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  IngredientCategory,
  IngredientStatus,
  SubscriptionStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { postExecutionStateReadFilter } from '@genfeedai/contracts/api-types';
import { CredentialPlatform, type Prisma } from '@genfeedai/prisma';
import { Inject, Injectable } from '@nestjs/common';

export interface SystemEmailEligibilityInput {
  userId: string;
  organizationId: string;
  templateKey: string;
  policyData?: Prisma.JsonValue;
}

export const GENERATED_CONTENT_FILTER = {
  category: {
    in: [
      IngredientCategory.IMAGE,
      IngredientCategory.VIDEO,
      IngredientCategory.MUSIC,
    ],
  },
  generationCompletedAt: { not: null },
  isDeleted: false,
  parentId: null,
  status: IngredientStatus.GENERATED,
} satisfies Prisma.IngredientWhereInput;

@Injectable()
export class SystemEmailEligibilityService {
  constructor(
    @Inject(SERVER_TOKENS.prisma) private readonly prisma: PrismaService,
  ) {}

  async shouldSend(input: SystemEmailEligibilityInput): Promise<boolean> {
    const data = this.policyData(input.policyData);
    const scope = { organizationId: input.organizationId, isDeleted: false };
    const brandId = typeof data.brandId === 'string' ? data.brandId : undefined;
    switch (input.templateKey) {
      case 'content-weekly':
      case 'content-daily':
        return this.hasRecapThreshold(input, data);
      case 'generation-ready':
      case 'generation-failed':
        return this.isGenerationResultStillCurrent(input, data);
      case 'credit-purchase-confirmation':
        return this.isPurchaseReceiptForRecipient(input, data);
      case 'welcome-day-2':
        return !(await this.hasConnection(input.organizationId));
      case 'welcome-day-7':
      case 'activation-nudge':
        return (
          (await this.hasConnection(input.organizationId)) &&
          (await this.hasGenerated(input.organizationId, input.userId)) &&
          !(await this.prisma.post.findFirst({
            select: { id: true },
            where: scopedWhere(input.organizationId, {
              ...scope,
              userId: input.userId,
              ...postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
            }),
          }))
        );
      case 'setup-reminder':
        return !(await this.setupComplete(input.organizationId));
      case 'first-generation':
        return (
          (await this.setupComplete(input.organizationId)) &&
          !(await this.hasGenerated(input.organizationId, input.userId))
        );
      case 'publishing-connection':
        return (
          !!brandId &&
          !(await this.hasConnection(input.organizationId, brandId)) &&
          (await this.hasGenerated(input.organizationId, input.userId, brandId))
        );
      case 'credit-low':
      case 'credit-exhausted': {
        const balance = await this.prisma.creditBalance.findFirst({
          where: scope,
          select: { balance: true, heldAmount: true },
        });
        if (!balance) return false;
        const spendable = balance.balance - balance.heldAmount;
        return input.templateKey === 'credit-exhausted'
          ? spendable <= 0
          : spendable > 0 && spendable < 1000;
      }
      case 'checkout-recovery': {
        const deliveryId =
          typeof data.lifecycleDeliveryId === 'string'
            ? data.lifecycleDeliveryId
            : undefined;
        if (!deliveryId) return false;
        const delivery = await this.prisma.lifecycleEmailDelivery.findFirst({
          where: { id: deliveryId, userId: input.userId },
          select: { status: true },
        });
        return !!delivery && !['canceled', 'skipped'].includes(delivery.status);
      }
      case 'win-back':
        return (
          !(await this.prisma.subscription.findFirst({
            select: { id: true },
            where: {
              ...scope,
              status: {
                in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
              },
            },
          })) &&
          !(await this.prisma.userSubscription.findFirst({
            select: { id: true },
            where: {
              userId: input.userId,
              isDeleted: false,
              status: {
                in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
              },
            },
          }))
        );
      default:
        return true;
    }
  }

  /** A recap only goes out when the closed period actually produced outputs. */
  private async hasRecapThreshold(
    input: SystemEmailEligibilityInput,
    data: Record<string, unknown>,
  ): Promise<boolean> {
    if (
      typeof data.periodStart !== 'string' ||
      typeof data.periodEnd !== 'string'
    )
      return false;
    const start = new Date(data.periodStart);
    const end = new Date(data.periodEnd);
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      start >= end
    )
      return false;
    const scope = { organizationId: input.organizationId, isDeleted: false };
    const generationCompletedAt = { gte: start, lt: end };
    const [ingredients, articles] = await Promise.all([
      this.prisma.ingredient.count({
        where: {
          ...GENERATED_CONTENT_FILTER,
          ...scope,
          userId: input.userId,
          generationCompletedAt,
        },
      }),
      this.prisma.article.count({
        where: { ...scope, userId: input.userId, generationCompletedAt },
      }),
    ]);
    return (
      ingredients + articles >= (input.templateKey === 'content-weekly' ? 5 : 1)
    );
  }

  /**
   * The asset must still be in the state the queued mail describes, still owned
   * by the recipient, and the run must have been long enough to be worth an
   * email at all.
   */
  private async isGenerationResultStillCurrent(
    input: SystemEmailEligibilityInput,
    data: Record<string, unknown>,
  ): Promise<boolean> {
    if (
      typeof data.assetId !== 'string' ||
      typeof data.completedAt !== 'string'
    )
      return false;
    const expected =
      input.templateKey === 'generation-ready'
        ? IngredientStatus.GENERATED
        : IngredientStatus.FAILED;
    if (data.status !== expected) return false;
    const asset = await this.prisma.ingredient.findFirst({
      where: {
        organizationId: input.organizationId,
        isDeleted: false,
        id: data.assetId,
        userId: input.userId,
        parentId: null,
      },
      select: {
        status: true,
        generationStartedAt: true,
        generationCompletedAt: true,
        cdnUrl: true,
        s3Key: true,
      },
    });
    return (
      !!asset &&
      asset.status === expected &&
      !!asset.generationStartedAt &&
      !!asset.generationCompletedAt &&
      asset.generationCompletedAt.toISOString() === data.completedAt &&
      asset.generationCompletedAt.getTime() -
        asset.generationStartedAt.getTime() >=
        120_000 &&
      (expected === IngredientStatus.FAILED || !!asset.cdnUrl || !!asset.s3Key)
    );
  }

  /** A receipt is only sent to the buyer, resolved from server-side ledger state. */
  private async isPurchaseReceiptForRecipient(
    input: SystemEmailEligibilityInput,
    data: Record<string, unknown>,
  ): Promise<boolean> {
    if (typeof data.transactionId !== 'string') return false;
    const receipt = await this.prisma.creditTransaction.findFirst({
      where: {
        organizationId: input.organizationId,
        isDeleted: false,
        id: data.transactionId,
        category: 'add',
        amount: { gt: 0 },
        referenceId: { not: null },
        referenceType: {
          in: [
            'stripe-checkout-session:organization-payment',
            'stripe-checkout-session:managed-inference',
            'stripe-checkout-session:user-credit',
          ],
        },
      },
      select: {
        actorUserId: true,
        organization: { select: { userId: true } },
      },
    });
    return (
      !!receipt &&
      (receipt.actorUserId ?? receipt.organization.userId) === input.userId
    );
  }

  async hasConnection(
    organizationId: string,
    brandId?: string,
  ): Promise<boolean> {
    return !!(await this.prisma.credential.findFirst({
      select: { id: true },
      where: scopedWhere(organizationId, {
        isConnected: true,
        ...(brandId ? { brandId } : {}),
        platform: {
          notIn: [
            CredentialPlatform.GOOGLE_ADS,
            CredentialPlatform.X_ADS,
            CredentialPlatform.GOOGLE_SEARCH_CONSOLE,
          ],
        },
        OR: [
          { accessTokenExpiry: null },
          { accessTokenExpiry: { gt: new Date() } },
          { refreshToken: { not: null } },
        ],
      }),
    }));
  }

  private async hasGenerated(
    organizationId: string,
    userId: string,
    brandId?: string,
  ): Promise<boolean> {
    const scope = {
      organizationId,
      userId,
      isDeleted: false,
      ...(brandId ? { brandId } : {}),
    };
    const [ingredient, article] = await Promise.all([
      this.prisma.ingredient.findFirst({
        where: scopedWhere(organizationId, {
          ...GENERATED_CONTENT_FILTER,
          ...scope,
        }),
        select: { id: true },
      }),
      this.prisma.article.findFirst({
        where: scopedWhere(organizationId, {
          ...scope,
          generationCompletedAt: { not: null },
        }),
        select: { id: true },
      }),
    ]);
    return !!ingredient || !!article;
  }

  private async setupComplete(organizationId: string): Promise<boolean> {
    return !!(await this.prisma.organization.findFirst({
      where: {
        id: organizationId,
        isDeleted: false,
        onboardingCompleted: true,
      },
      select: { id: true },
    }));
  }

  private policyData(value: Prisma.JsonValue | undefined): Prisma.JsonObject {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  }
}
