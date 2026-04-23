import { UserSubscriptionEntity } from '@api/collections/user-subscriptions/entities/user-subscription.entity';
import type { UserSubscriptionDocument } from '@api/collections/user-subscriptions/schemas/user-subscription.schema';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SubscriptionStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import StripeConstructor from 'stripe';

type StripeClient = InstanceType<typeof StripeConstructor>;
type CheckoutSession = Awaited<
  ReturnType<StripeClient['checkout']['sessions']['create']>
>;

@Injectable()
export class UserSubscriptionsService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  @HandleErrors('create user subscription', 'user-subscriptions')
  async create(
    subscription: UserSubscriptionEntity,
  ): Promise<UserSubscriptionDocument> {
    const result = await this.prisma.userSubscription.create({
      data: subscription as never,
    });
    return result as unknown as UserSubscriptionDocument;
  }

  @HandleErrors('find by user', 'user-subscriptions')
  async findByUser(userId: string): Promise<UserSubscriptionDocument | null> {
    const result = await this.prisma.userSubscription.findFirst({
      where: {
        isDeleted: false,
        userId,
      },
    });
    return result as unknown as UserSubscriptionDocument | null;
  }

  @HandleErrors('find by stripe customer id', 'user-subscriptions')
  async findByStripeCustomerId(
    stripeCustomerId: string,
  ): Promise<UserSubscriptionDocument | null> {
    const result = await this.prisma.userSubscription.findFirst({
      where: {
        isDeleted: false,
        stripeCustomerId,
      },
    });
    return result as unknown as UserSubscriptionDocument | null;
  }

  @HandleErrors('get or create subscription', 'user-subscriptions')
  async getOrCreateSubscription(
    userId: string,
    stripeCustomerId: string,
  ): Promise<UserSubscriptionDocument> {
    let subscription = await this.findByUser(userId);

    if (!subscription) {
      const newSubscription = new UserSubscriptionEntity({
        cancelAtPeriodEnd: false,
        isDeleted: false,
        status: SubscriptionStatus.ACTIVE,
        stripeCustomerId,
        userId,
      });
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

    const updateData: Record<string, unknown> = {};

    if (session.subscription) {
      updateData.stripeSubscriptionId = session.subscription as string;
    }

    const result = await this.prisma.userSubscription.update({
      data: updateData as never,
      where: { id: subscription.id },
    });
    return result as unknown as UserSubscriptionDocument;
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

    const updateData: Record<string, unknown> = { status };

    if (currentPeriodEnd !== undefined) {
      updateData.currentPeriodEnd = currentPeriodEnd;
    }

    if (cancelAtPeriodEnd !== undefined) {
      updateData.cancelAtPeriodEnd = cancelAtPeriodEnd;
    }

    const result = await this.prisma.userSubscription.update({
      data: updateData as never,
      where: { id: subscription.id },
    });
    return result as unknown as UserSubscriptionDocument;
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
