import { UserSubscriptionEntity } from '@api/collections/user-subscriptions/entities/user-subscription.entity';
import {
  UserSubscription,
  type UserSubscriptionDocument,
} from '@api/collections/user-subscriptions/schemas/user-subscription.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { SubscriptionStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Stripe from 'stripe';

@Injectable()
export class UserSubscriptionsService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    @InjectModel(UserSubscription.name, DB_CONNECTIONS.AUTH)
    private readonly model: Model<UserSubscriptionDocument>,
    private readonly logger: LoggerService,
  ) {}

  @HandleErrors('create user subscription', 'user-subscriptions')
  async create(
    subscription: UserSubscriptionEntity,
  ): Promise<UserSubscriptionDocument> {
    const newSubscription = new this.model(subscription);
    return await newSubscription.save();
  }

  private isValidObjectId(id: string): boolean {
    return Types.ObjectId.isValid(id) && id.length === 24;
  }

  @HandleErrors('find by user', 'user-subscriptions')
  async findByUser(userId: string): Promise<UserSubscriptionDocument | null> {
    if (!this.isValidObjectId(userId)) {
      this.logger.warn(`${this.constructorName} findByUser failed`, {
        userId,
      });
      return null;
    }

    return await this.model
      .findOne({
        isDeleted: { $ne: true },
        user: new Types.ObjectId(userId),
      })
      .exec();
  }

  @HandleErrors('find by stripe customer id', 'user-subscriptions')
  async findByStripeCustomerId(
    stripeCustomerId: string,
  ): Promise<UserSubscriptionDocument | null> {
    return await this.model
      .findOne({
        isDeleted: { $ne: true },
        stripeCustomerId,
      })
      .exec();
  }

  @HandleErrors('get or create subscription', 'user-subscriptions')
  async getOrCreateSubscription(
    userId: string,
    stripeCustomerId: string,
  ): Promise<UserSubscriptionDocument> {
    if (!this.isValidObjectId(userId)) {
      throw new Error(`Invalid user ID: ${userId}`);
    }

    let subscription = await this.findByUser(userId);

    if (!subscription) {
      const newSubscription = new UserSubscriptionEntity({
        cancelAtPeriodEnd: false,
        isDeleted: false,
        status: SubscriptionStatus.ACTIVE,
        stripeCustomerId,
        user: new Types.ObjectId(userId),
      });
      subscription = await this.create(newSubscription);
    }

    return subscription;
  }

  @HandleErrors('update from stripe session', 'user-subscriptions')
  async updateFromStripeSession(
    userId: string,
    session: Stripe.Checkout.Session,
  ): Promise<UserSubscriptionDocument | null> {
    const subscription = await this.findByUser(userId);

    if (!subscription) {
      this.logger.warn(
        `${this.constructorName} updateFromStripeSession: no subscription found`,
        { userId },
      );
      return null;
    }

    const updateData: Partial<UserSubscription> = {};

    if (session.subscription) {
      updateData.stripeSubscriptionId = session.subscription as string;
    }

    return await this.model
      .findByIdAndUpdate(subscription._id, updateData, {
        returnDocument: 'after',
      })
      .exec();
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

    const updateData: Partial<UserSubscription> = { status };

    if (currentPeriodEnd !== undefined) {
      updateData.currentPeriodEnd = currentPeriodEnd;
    }

    if (cancelAtPeriodEnd !== undefined) {
      updateData.cancelAtPeriodEnd = cancelAtPeriodEnd;
    }

    return await this.model
      .findByIdAndUpdate(subscription._id, updateData, {
        returnDocument: 'after',
      })
      .exec();
  }

  async delete(id: string): Promise<void> {
    try {
      await this.model.findByIdAndUpdate(id, { isDeleted: true }).exec();
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} delete failed`, {
        error,
        id,
      });

      throw error;
    }
  }
}
