import { CustomersService } from '@api/collections/customers/services/customers.service';
import { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import { CreateSubscriptionDto } from '@api/collections/subscriptions/dto/create-subscription.dto';
import { UpdateSubscriptionDto } from '@api/collections/subscriptions/dto/update-subscription.dto';
import { SubscriptionEntity } from '@api/collections/subscriptions/entities/subscription.entity';
import {
  Subscription,
  type SubscriptionDocument,
} from '@api/collections/subscriptions/schemas/subscription.schema';
import { UsersService } from '@api/collections/users/services/users.service';
import { ConfigService } from '@api/config/config.service';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { SubscriptionPlan, SubscriptionStatus } from '@genfeedai/enums';
import type { ISubscriptionsService } from '@genfeedai/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

type ClerkSyncSubscription = {
  _id?: string;
  user: string;
  stripePriceId?: string;
  stripeSubscriptionId?: string;
  status?: string;
};

/**
 * Enterprise subscriptions service. The OSS-callable surface (`findOne`,
 * `findByOrganizationId`, `findAll`) is locked by
 * {@link import('@genfeedai/interfaces/billing').ISubscriptionsService}.
 *
 * The other methods on this class (Stripe sync, plan changes, Clerk metadata
 * sync, preview subscription change) are enterprise-only and move to
 * `ee/packages/billing/` in Phase C Layer 2 (tracked in issue #87).
 *
 * `findOne` here is inherited from `BaseService<SubscriptionDocument>`, which
 * returns `Promise<SubscriptionDocument | null>`. Mongoose documents are
 * structurally assignable to `ISubscription | null` because they expose the
 * same public fields; the compiler validates the conformance via the
 * `implements` clause below.
 */
@Injectable()
export class SubscriptionsService
  extends BaseService<
    SubscriptionDocument,
    CreateSubscriptionDto,
    UpdateSubscriptionDto
  >
  implements ISubscriptionsService
{
  public readonly constructorName: string = String(this.constructor.name);

  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly stripeService: StripeService,
    private readonly customersService: CustomersService,
    private readonly clerkService: ClerkService,
  ) {
    // TODO: remove model arg after BaseService Prisma migration
    super(undefined as never, logger);
  }

  /**
   * Syncs subscription data to Clerk public metadata
   */
  async syncSubscriptionToClerkMetadata(
    subscription: ClerkSyncSubscription,
    stripeSubscriptionId?: string,
    stripePriceId?: string,
    status?: string,
    subscriptionTier?: string,
  ) {
    try {
      const user = await this.usersService.findOne({
        _id: subscription.user,
      });

      if (!user) {
        return this.logger.warn(
          `${this.constructorName} user not found for subscription`,
          {
            subscriptionId: subscription._id,
          },
        );
      }

      // Update Clerk public metadata
      await this.clerkService.updateUserPublicMetadata(user.clerkId, {
        stripePriceId: stripePriceId || subscription.stripePriceId,
        stripeSubscriptionId:
          stripeSubscriptionId || subscription.stripeSubscriptionId,
        stripeSubscriptionStatus: status || subscription.status,
        ...(subscriptionTier ? { subscriptionTier } : {}),
      });

      this.logger.log('Subscription synced to Clerk metadata', {
        clerkUserId: user.clerkId,
        status: status || subscription.status,
        stripeSubscriptionId:
          stripeSubscriptionId || subscription.stripeSubscriptionId,
      });
    } catch (error: unknown) {
      this.logger.error('Failed to sync subscription to Clerk metadata', error);
    }
  }

  @HandleErrors('create subscription for organization', 'subscriptions')
  async createForOrganization(
    organization: OrganizationDocument,
    billingEmail: string,
    userId: string,
  ): Promise<Subscription> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    // Check if customer already exists for this organization
    let customer = await this.customersService.findByOrganizationId(
      organization._id.toString(),
    );
    let stripeCustomer;

    if (customer) {
      // Customer exists, retrieve from Stripe to ensure it's valid
      this.logger.log(`${url} using existing customer`, {
        customerId: customer._id,
        organizationId: organization._id,
        stripeCustomerId: customer.stripeCustomerId,
      });

      stripeCustomer = await this.stripeService.retrieveCustomer(
        customer.stripeCustomerId,
      );

      if (!stripeCustomer) {
        // Stripe customer doesn't exist, create new one and update our record
        stripeCustomer = await this.stripeService.createOrganizationCustomer(
          organization.label,
          billingEmail,
          organization._id.toString(),
          userId,
        );

        customer = await this.customersService.patch(customer._id.toString(), {
          stripeCustomerId: stripeCustomer.id,
        });
      }
    } else {
      // No customer exists, create new one
      stripeCustomer = await this.stripeService.createOrganizationCustomer(
        organization.label,
        billingEmail,
        organization._id.toString(),
        userId,
      );

      customer = await this.customersService.create({
        organization: organization._id.toString(),
        stripeCustomerId: stripeCustomer.id,
      });
    }

    const subscriptionData = new SubscriptionEntity({
      customerId: customer._id.toString(),
      isDeleted: false,
      organizationId: organization._id.toString(),
      status: SubscriptionStatus.INCOMPLETE,
      stripeCustomerId: stripeCustomer.id,
      type: SubscriptionPlan.MONTHLY,
      userId,
    });

    const savedSubscription = await this.create(subscriptionData as never);

    this.logger.log(`${url} success`, {
      customerId: customer._id,
      existingCustomer: !!customer,
      organizationId: organization._id,
      stripeCustomerId: stripeCustomer.id,
      subscriptionId: savedSubscription._id,
    });

    return savedSubscription;
  }

  async findByOrganizationId(
    organizationId: string,
  ): Promise<Subscription | null> {
    const result = await this.prisma.subscription.findFirst({
      where: { isDeleted: false, organizationId },
    });
    return result as unknown as Subscription | null;
  }

  async findByStripeCustomerId(
    stripeCustomerId: string,
  ): Promise<Subscription | null> {
    const result = await this.prisma.subscription.findFirst({
      where: { isDeleted: false, stripeCustomerId },
    });
    return result as unknown as Subscription | null;
  }

  async syncWithStripe(subscription: Subscription): Promise<Subscription> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const stripeCustomer = await this.stripeService.retrieveCustomer(
        subscription.stripeCustomerId,
      );

      if (!stripeCustomer) {
        throw new NotFoundException('Customer not found in Stripe');
      }

      this.logger.log(`${url} success`, {
        stripeCustomerId: subscription.stripeCustomerId,
        subscriptionId: subscription._id,
      });

      return subscription;
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
      throw error;
    }
  }

  async changeSubscriptionPlan(
    organizationId: string,
    newPriceId: string,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // Find the organization's subscription
      const subscription = await this.findByOrganizationId(organizationId);
      if (!subscription) {
        throw new NotFoundException('Subscription not found');
      }

      if (!subscription.stripeSubscriptionId) {
        throw new BadRequestException('No active Stripe subscription found');
      }

      // Change the plan in Stripe with pro-rata billing
      const updatedStripeSubscription =
        await this.stripeService.changeSubscriptionPlan(
          subscription.stripeSubscriptionId,
          newPriceId,
          'create_prorations',
        );

      // Update subscription type based on new price
      let newType = SubscriptionPlan.MONTHLY;
      if (newPriceId.includes('yearly') || newPriceId.includes('year')) {
        newType = SubscriptionPlan.YEARLY;
      }

      // Update our local subscription record
      const updatedSubscription = await this.patch(
        subscription._id.toString(),
        {
          currentPeriodEnd: updatedStripeSubscription.items.data[0]
            ?.current_period_end
            ? new Date(
                updatedStripeSubscription.items.data[0].current_period_end *
                  1000,
              )
            : undefined,
          status: updatedStripeSubscription.status,
          stripePriceId: newPriceId,
          type: newType,
        },
      );

      // Sync subscription data to Clerk metadata
      await this.syncSubscriptionToClerkMetadata(updatedSubscription);

      // Reset credits to new plan's allocation when changing subscription type
      if (newType !== subscription.type) {
        let creditsForNewPlan = 0;
        let source = 'subscription_change';

        if (newType === SubscriptionPlan.MONTHLY) {
          creditsForNewPlan =
            Number(this.configService.get('STRIPE_MONTHLY_CREDITS')) || 35_000;
          source = 'change_to_monthly';
        } else if (newType === SubscriptionPlan.YEARLY) {
          creditsForNewPlan =
            Number(this.configService.get('STRIPE_YEARLY_CREDITS')) || 500_000;
          source = 'change_to_yearly';
        }

        if (creditsForNewPlan > 0) {
          // await this.creditsUtilsService.resetOrganizationCredits(
          //   organizationId,
          //   creditsForNewPlan,
          //   source,
          //   `Credits reset due to subscription change from ${subscription.type} to ${newType}`,
          // );

          this.logger.log(`${url} credits reset for plan change`, {
            newCredits: creditsForNewPlan,
            newPlan: newType,
            oldPlan: subscription.type,
            organizationId,
            source,
          });
        }
      }

      this.logger.log(`${url} success`, {
        newPriceId,
        newType,
        oldPriceId: subscription.stripePriceId,
        oldType: subscription.type,
        subscriptionId: subscription._id,
      });

      return {
        stripeSubscription: updatedStripeSubscription,
        subscription: updatedSubscription,
      };
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
      throw error;
    }
  }

  async previewSubscriptionChange(
    organizationId: string,
    newPriceId: string,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // Find the organization's subscription
      const subscription = await this.findByOrganizationId(organizationId);

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      if (!subscription.stripeSubscriptionId) {
        throw new BadRequestException('No active Stripe subscription found');
      }

      // Get the upcoming invoice preview
      const upcomingInvoice = await this.stripeService.getUpcomingInvoice(
        subscription.stripeCustomerId,
        subscription.stripeSubscriptionId,
        newPriceId,
      );

      // Get current subscription details from Stripe
      const currentStripeSubscription =
        await this.stripeService.getSubscription(
          subscription.stripeSubscriptionId,
        );

      // Calculate the proration amount
      const currentPrice = currentStripeSubscription.items.data[0]?.price;

      // Calculate proration based on price difference
      const currentPriceAmount = currentPrice?.unit_amount || 0;
      const newPrice = await this.stripeService.getPrice(newPriceId);
      const newPriceAmount = newPrice.unit_amount || 0;

      // Simple proration calculation (in a real scenario, you'd want to factor in the billing cycle)
      const prorationAmount = newPriceAmount - currentPriceAmount;
      const isUpgrade = prorationAmount > 0;
      const isDowngrade = prorationAmount < 0;

      this.logger.log(`${url} success`, {
        currentPriceId: currentPrice?.id,
        isDowngrade,
        isUpgrade,
        newPriceId,
        prorationAmount,
        subscriptionId: subscription._id,
      });

      return {
        currentPrice,
        isDowngrade,
        isUpgrade,
        newPriceId,
        prorationAmount,
        upcomingInvoice: {
          amount_due: prorationAmount,
          currency: upcomingInvoice.currency,
          lines: upcomingInvoice.lines.data,
        },
      };
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
      throw error;
    }
  }
}
