import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { CustomersService } from '@api/collections/customers/services/customers.service';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import { ConfigService } from '@api/config/config.service';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import {
  type StripeCustomer,
  StripeService,
} from '@api/services/integrations/stripe/services/stripe.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { SubscriptionPlan, SubscriptionStatus } from '@genfeedai/enums';
import type { ISubscriptionsService } from '@genfeedai/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateSubscriptionDto } from '../dto/create-subscription.dto';
import type { UpdateSubscriptionDto } from '../dto/update-subscription.dto';
import type { SubscriptionDocument } from '../schemas/subscription.schema';

type SubscriptionStateSync = {
  id?: string;
  organization?: string;
  user?: string;
  stripePriceId?: string | null;
  stripeSubscriptionId?: string | null;
  status?: string | null;
};

/**
 * Enterprise subscriptions service. The OSS-callable surface (`findOne`,
 * `findByOrganizationId`, `findAll`) is locked by
 * {@link import('@genfeedai/interfaces/billing').ISubscriptionsService}.
 *
 * The other methods on this class (Stripe sync, plan changes, legacy auth provider metadata
 * sync, preview subscription change) are enterprise-only and move to
 * `ee/packages/billing/` in Phase C Layer 2 (tracked in issue #87).
 *
 * `findOne` here is inherited from `BaseService<SubscriptionDocument>`, which
 * returns `Promise<SubscriptionDocument | null>`. The service entity type is
 * structurally assignable to `ISubscription | null` because it exposes the same
 * public fields; the compiler validates the conformance via the `implements`
 * clause below.
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

  private requireString(
    value: string | null | undefined,
    label: string,
  ): string {
    if (!value) {
      throw new BadRequestException(`${label} is required`);
    }

    return value;
  }

  private async resolveStripeCustomerId(
    customerId: string | null | undefined,
  ): Promise<string | undefined> {
    if (!customerId) {
      return undefined;
    }

    const customer = await this.prisma.customer.findUnique({
      select: { stripeCustomerId: true },
      where: { id: customerId },
    });

    return customer?.stripeCustomerId ?? undefined;
  }

  /**
   * The DB column is `plan`; the in-memory field consumers branch on
   * (Stripe invoice.paid credit allocation, legacy auth provider sync, tier resolution)
   * is `type`. Overriding here guarantees EVERY BaseService read path
   * (findOne/findAll/patch/create) populates it — previously only
   * findByOrganizationId/findByStripeCustomerId did, so webhook handlers
   * using findOne({stripeSubscriptionId}) saw type=undefined and silently
   * skipped credit allocation.
   */
  protected override normalizeDocument(
    document: unknown,
  ): SubscriptionDocument {
    const normalized = super.normalizeDocument(
      document,
    ) as SubscriptionDocument & {
      plan?: string | null;
    };

    if (typeof normalized !== 'object' || normalized === null) {
      return normalized;
    }

    return {
      ...normalized,
      customer:
        normalized.customer ??
        (normalized.customerId ? String(normalized.customerId) : undefined),
      type: normalized.type ?? normalized.plan ?? undefined,
    };
  }

  private async normalizeSubscriptionDocument(
    document: unknown,
  ): Promise<SubscriptionDocument> {
    const normalized = this.normalizeDocument(document);

    const stripeCustomerId =
      normalized.stripeCustomerId ??
      (await this.resolveStripeCustomerId(normalized.customerId));

    return {
      ...normalized,
      stripeCustomerId,
    };
  }

  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly stripeService: StripeService,
    private readonly customersService: CustomersService,
    @Inject(forwardRef(() => CreditsUtilsService))
    private readonly creditsUtilsService: CreditsUtilsService,
  ) {
    super(prisma, 'subscription', logger);
  }

  /**
   * Persists subscription state to the DB.
   * When `subscriptionTier` is provided and the subscription carries an
   * `organization` reference, writes `subscriptionTier` to
   * `OrganizationSetting` via Prisma so the request-context middleware can
   * read it without touching legacy auth provider.
   */
  async syncSubscriptionState(
    subscription: SubscriptionStateSync,
    _stripeSubscriptionId?: string,
    _stripePriceId?: string,
    _status?: string,
    subscriptionTier?: string,
  ) {
    try {
      const organizationId = subscription.organization
        ? String(subscription.organization)
        : undefined;

      if (organizationId && subscriptionTier) {
        await this.prisma.organizationSetting.updateMany({
          data: { subscriptionTier },
          where: { organizationId },
        });

        this.logger.log('Subscription tier persisted to DB', {
          organizationId,
          subscriptionTier,
        });
      } else {
        this.logger.log('Subscription state sync skipped (no tier to write)', {
          hasOrganizationId: Boolean(organizationId),
          hasSubscriptionTier: Boolean(subscriptionTier),
          subscriptionId: subscription.id,
        });
      }
    } catch (error: unknown) {
      this.logger.error('Failed to sync subscription state to DB', error);
    }
  }

  @HandleErrors('create subscription for organization', 'subscriptions')
  async createForOrganization(
    organization: OrganizationDocument,
    billingEmail: string,
    userId: string,
  ): Promise<SubscriptionDocument> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    // Check if customer already exists for this organization
    let customer = await this.customersService.findByOrganizationId(
      organization.id.toString(),
    );
    let stripeCustomer: StripeCustomer | null;

    if (customer) {
      // Customer exists, retrieve from Stripe to ensure it's valid
      this.logger.log(`${url} using existing customer`, {
        customerId: customer.id,
        organizationId: organization.id,
        stripeCustomerId: customer.stripeCustomerId,
      });

      stripeCustomer = await this.stripeService.retrieveCustomer(
        this.requireString(
          customer.stripeCustomerId,
          'Customer stripeCustomerId',
        ),
      );

      if (!stripeCustomer) {
        // Stripe customer doesn't exist, create new one and update our record
        stripeCustomer = await this.stripeService.createOrganizationCustomer(
          organization.label,
          billingEmail,
          organization.id.toString(),
          userId,
        );

        customer = await this.customersService.patch(customer.id.toString(), {
          stripeCustomerId: stripeCustomer.id,
        });
      }
    } else {
      // No customer exists, create new one
      stripeCustomer = await this.stripeService.createOrganizationCustomer(
        organization.label,
        billingEmail,
        organization.id.toString(),
        userId,
      );

      customer = await this.customersService.create({
        organization: organization.id.toString(),
        stripeCustomerId: stripeCustomer.id,
      });
    }

    const subscriptionData = {
      customerId: customer.id.toString(),
      isDeleted: false,
      organizationId: organization.id.toString(),
      plan: SubscriptionPlan.MONTHLY,
      status: SubscriptionStatus.INCOMPLETE,
      userId,
    } as unknown as Parameters<typeof this.create>[0];

    const savedSubscription = await this.create(subscriptionData);

    this.logger.log(`${url} success`, {
      customerId: customer.id,
      existingCustomer: !!customer,
      organizationId: organization.id,
      stripeCustomerId: stripeCustomer.id,
      subscriptionId: savedSubscription.id,
    });

    return savedSubscription;
  }

  async findByOrganizationId(
    organizationId: string,
  ): Promise<SubscriptionDocument | null> {
    const result = await this.prisma.subscription.findFirst({
      where: { isDeleted: false, organizationId },
    });
    return result ? await this.normalizeSubscriptionDocument(result) : null;
  }

  async findByStripeCustomerId(
    stripeCustomerId: string,
  ): Promise<SubscriptionDocument | null> {
    const customer =
      await this.customersService.findByStripeCustomerId(stripeCustomerId);
    if (!customer?.id) {
      return null;
    }

    const result = await this.prisma.subscription.findFirst({
      where: { customerId: String(customer.id), isDeleted: false },
    });
    return result ? await this.normalizeSubscriptionDocument(result) : null;
  }

  async syncWithStripe(
    subscription: SubscriptionDocument,
  ): Promise<SubscriptionDocument> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const stripeCustomer = await this.stripeService.retrieveCustomer(
        this.requireString(
          await this.resolveStripeCustomerId(subscription.customerId),
          'Subscription stripeCustomerId',
        ),
      );

      if (!stripeCustomer) {
        throw new NotFoundException('Customer not found in Stripe');
      }

      this.logger.log(`${url} success`, {
        stripeCustomerId: subscription.stripeCustomerId,
        subscriptionId: subscription.id,
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
      const updatedSubscription = await this.patch(subscription.id.toString(), {
        currentPeriodEnd: updatedStripeSubscription.items.data[0]
          ?.current_period_end
          ? new Date(
              updatedStripeSubscription.items.data[0].current_period_end * 1000,
            )
          : undefined,
        status: updatedStripeSubscription.status,
        stripePriceId: newPriceId,
        plan: newType,
      });

      // Sync subscription state to DB
      await this.syncSubscriptionState(updatedSubscription);

      // Reset credits to new plan's allocation when changing subscription type
      const previousPlan = subscription.type ?? subscription.plan ?? undefined;
      if (newType !== previousPlan) {
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
          await this.creditsUtilsService.resetOrganizationCredits(
            organizationId,
            creditsForNewPlan,
            source,
            `Credits reset due to subscription change from ${subscription.type} to ${newType}`,
          );

          this.logger.log(`${url} credits reset for plan change`, {
            newCredits: creditsForNewPlan,
            newPlan: newType,
            oldPlan: previousPlan,
            organizationId,
            source,
          });
        }
      }

      this.logger.log(`${url} success`, {
        newPriceId,
        newType,
        oldPriceId: subscription.stripePriceId,
        oldType: previousPlan,
        subscriptionId: subscription.id,
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
        this.requireString(
          await this.resolveStripeCustomerId(subscription.customerId),
          'Subscription stripeCustomerId',
        ),
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
        subscriptionId: subscription.id,
      });

      return {
        currentPrice,
        isDowngrade,
        isUpgrade,
        newPriceId,
        prorationAmount,
        upcomingInvoice: {
          // Stripe's preview already accounts for billing-cycle position;
          // the naive price diff over/under-charged mid-cycle changes.
          amount_due: upcomingInvoice.amount_due,
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
