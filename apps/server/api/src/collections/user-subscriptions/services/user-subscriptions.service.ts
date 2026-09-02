import type { UserSubscriptionDocument } from '@api/collections/user-subscriptions/schemas/user-subscription.schema';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { IUserSubscriptionsService } from '@genfeedai/contracts/interfaces/billing';
import { type Prisma, SubscriptionStatus } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import type StripeConstructor from 'stripe';

type StripeClient = InstanceType<typeof StripeConstructor>;
type CheckoutSession = Awaited<
  ReturnType<StripeClient['checkout']['sessions']['create']>
>;

@Injectable()
export class UserSubscriptionsService implements IUserSubscriptionsService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  @HandleErrors('create user subscription', 'user-subscriptions')
  async create(
    subscription: Prisma.UserSubscriptionUncheckedCreateInput,
  ): Promise<UserSubscriptionDocument> {
    const result = await this.prisma.userSubscription.create({
      data: subscription,
    });
    return result;
  }

  @HandleErrors('find by user', 'user-subscriptions')
  async findByUser(userId: string): Promise<UserSubscriptionDocument | null> {
    const result = await this.prisma.userSubscription.findUnique({
      where: {
        userId,
      },
    });
    return result?.isDeleted ? null : result;
  }

  @HandleErrors('get or create subscription', 'user-subscriptions')
  async getOrCreateSubscription(
    userId: string,
  ): Promise<UserSubscriptionDocument> {
    let subscription = await this.findByUser(userId);

    if (!subscription) {
      const newSubscription: Prisma.UserSubscriptionUncheckedCreateInput = {
        cancelAtPeriodEnd: false,
        isDeleted: false,
        status: SubscriptionStatus.ACTIVE,
        userId,
      };
      subscription = await this.create(newSubscription);
    }

    return subscription;
  }

  @HandleErrors('update from stripe session', 'user-subscriptions')
  async updateFromStripeSession(
    userId: string,
    session: CheckoutSession,
  ): Promise<UserSubscriptionDocument | null> {
    const subscription = await this.findByUser(userId);

    if (!subscription) {
      this.logger.warn(
        `${this.constructorName} updateFromStripeSession: no subscription found`,
        { userId },
      );
      return null;
    }

    const updateData: Prisma.UserSubscriptionUncheckedUpdateInput = {};

    if (session.subscription) {
      updateData.stripeSubscriptionId = session.subscription as string;
    }

    const result = await this.prisma.userSubscription.update({
      data: updateData,
      where: { id: subscription.id },
    });
    return result;
  }

  @HandleErrors('update subscription status', 'user-subscriptions')
  async updateStatus(
    userId: string,
    status: SubscriptionStatus,
    currentPeriodEnd?: Date,
    cancelAtPeriodEnd?: boolean,
  ): Promise<UserSubscriptionDocument | null> {
    const subscription = await this.findByUser(userId);

    if (!subscription) {
      return null;
    }

    const updateData: Prisma.UserSubscriptionUncheckedUpdateInput = { status };

    if (currentPeriodEnd !== undefined) {
      updateData.currentPeriodEnd = currentPeriodEnd;
    }

    if (cancelAtPeriodEnd !== undefined) {
      updateData.cancelAtPeriodEnd = cancelAtPeriodEnd;
    }

    const result = await this.prisma.userSubscription.update({
      data: updateData,
      where: { id: subscription.id },
    });
    return result;
  }

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.userSubscription.update({
        data: { isDeleted: true },
        where: { id },
      });
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} delete failed`, {
        error,
        id,
      });

      throw error;
    }
  }
}
