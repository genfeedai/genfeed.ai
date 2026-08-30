import { CustomersService } from '@api/collections/customers/services/customers.service';
import type { CreateSubscriptionDto } from '@api/collections/subscriptions/dto/create-subscription.dto';
import type { UpdateSubscriptionDto } from '@api/collections/subscriptions/dto/update-subscription.dto';
import type { SubscriptionDocument } from '@api/collections/subscriptions/schemas/subscription.schema';
import { SubscriptionCreditGrantService } from '@api/common/subscriptions/subscription-credit-grant.service';
import {
  SubscriptionPlan,
  SubscriptionStatus,
  toPrismaSubscriptionStatus,
} from '@genfeedai/enums';
import type { SubscriptionChangePreview } from '@genfeedai/interfaces';
import type {
  ISubscriptionFindAllOptions,
  ISubscriptionFindAllResult,
  ISubscriptionOssReadModel,
  ISubscriptionsService,
} from '@genfeedai/interfaces/billing';
import { Prisma } from '@genfeedai/prisma';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common';
import { CreditsUtilsService } from '@server/collections/credits/services/credits.utils.service';
import type { OrganizationDocument } from '@server/collections/organizations/schemas/organization.schema';
import { NotFoundException } from '@server/exceptions/not-found.exception';
import { HandleErrors } from '@server/helpers/decorators/error-handler.decorator';
import { StripeService } from '@server/services/integrations/stripe/services/stripe.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import {
  BaseService,
  type PopulateInput,
} from '@server/shared/services/base/base.service';
import type { AggregatePaginateResult } from '@server/types/aggregate-paginate-result';

type SubscriptionsFindAllResult =
  AggregatePaginateResult<SubscriptionDocument> & ISubscriptionFindAllResult;

/**
 * Organization (Stripe) subscriptions service, bound to `SUBSCRIPTIONS_SERVICE`
 * when organization billing is live at runtime. Its cross-module surface is
 * locked by {@link import('@genfeedai/interfaces/billing').ISubscriptionsService}.
 * All returned records use canonical Prisma scalar foreign keys. The optional
 * `stripeCustomerId` is derived from the related customer for Stripe calls and
 * is not persisted on the subscription row.
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
    organizationId: string | null | undefined,
  ): Promise<string | undefined> {
    if (!customerId || !organizationId) {
      return undefined;
    }

    const customer = await this.prisma.customer.findFirst({
      select: { stripeCustomerId: true },
      where: { id: customerId, isDeleted: false, organizationId },
    });

    return customer?.stripeCustomerId ?? undefined;
  }

  private async normalizeSubscriptionDocument(
    document: unknown,
  ): Promise<SubscriptionDocument> {
    const normalized = this.normalizeDocument(document) as SubscriptionDocument;

    const stripeCustomerId =
      normalized.stripeCustomerId ??
      (await this.resolveStripeCustomerId(
        normalized.customerId,
        normalized.organizationId,
      ));

    return {
      ...normalized,
      stripeCustomerId,
    };
  }

  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly creditGrantService: SubscriptionCreditGrantService,
    private readonly stripeService: StripeService,
    private readonly customersService: CustomersService,
    @Inject(forwardRef(() => CreditsUtilsService))
    private readonly creditsUtilsService: CreditsUtilsService,
  ) {
    super(prisma, 'subscription', logger);
  }

  /**
   * `stripeCustomerId` is derived from the related customer, never persisted on
   * the subscription row, so `BaseService.create` returns it as `undefined`.
   * Callers treat an absent `stripeCustomerId` as "no Stripe customer yet" and
   * create one — which duplicated the org's Stripe customer on every first
   * checkout. Every read path normalizes; so must this one.
   */
  override async create(
    createDto: CreateSubscriptionDto,
    populate: PopulateInput = [],
  ): Promise<SubscriptionDocument> {
    const created = await super.create(createDto, populate);

    return await this.normalizeSubscriptionDocument(created);
  }

  override async findAll(
    input: unknown,
    options: ISubscriptionFindAllOptions,
    enableCache: boolean = true,
  ): Promise<SubscriptionsFindAllResult> {
    const result = await super.findAll(input, options, enableCache);

    return {
      ...result,
      total: result.totalDocs,
      totalDocs: result.totalDocs,
    };
  }

  /**
   * Persists subscription state to the DB.
   * When `subscriptionTier` is provided and the subscription carries an
   * `organizationId`, writes `subscriptionTier` to
   * `OrganizationSetting` via Prisma so the request-context middleware can
   * read it without touching legacy auth provider.
   */
  async syncSubscriptionState(
    subscription: ISubscriptionOssReadModel | null,
    _stripeSubscriptionId?: string,
    _stripePriceId?: string,
    _status?: string,
    subscriptionTier?: string,
  ) {
    try {
      const orgId = subscription?.organizationId;

      if (orgId && subscriptionTier) {
        // OrganizationSetting.organizationId is unique, so this tenant-keyed
        // updateMany touches at most one row.
        await this.prisma.organizationSetting.updateMany({
          data: { subscriptionTier },
          where: { organizationId: orgId },
        });

        this.logger.log('Subscription tier persisted to DB', {
          organizationId: orgId,
          subscriptionTier,
        });
      } else {
        this.logger.log('Subscription state sync skipped (no tier to write)', {
          hasOrganizationId: Boolean(orgId),
          hasSubscriptionTier: Boolean(subscriptionTier),
          subscriptionId: subscription?.id,
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

    const organizationId = organization.id.toString();
    let hasExistingCustomer = false;
    const customer = await this.customersService.provisionForOrganization(
      organizationId,
      async (currentStripeCustomerId) => {
        hasExistingCustomer = Boolean(currentStripeCustomerId);
        if (currentStripeCustomerId) {
          this.logger.log(`${url} using existing customer`, {
            organizationId,
            stripeCustomerId: currentStripeCustomerId,
          });
          const existingStripeCustomer =
            await this.stripeService.retrieveCustomer(currentStripeCustomerId);
          if (existingStripeCustomer) {
            return existingStripeCustomer.id;
          }
        }

        const created = await this.stripeService.createOrganizationCustomer(
          organization.label,
          billingEmail,
          organizationId,
          userId,
          currentStripeCustomerId,
        );
        return created.id;
      },
    );
    const stripeCustomerId = this.requireString(
      customer.stripeCustomerId,
      'Customer stripeCustomerId',
    );

    const subscriptionData = {
      customerId: customer.id.toString(),
      organizationId: organization.id.toString(),
      plan: SubscriptionPlan.MONTHLY,
      status: SubscriptionStatus.INCOMPLETE,
      userId,
    } satisfies CreateSubscriptionDto;

    // One active subscription row per org (partial unique index
    // `subscriptions_organizationId_active_key`): a concurrent createForOrganization
    // that loses the insert race returns the winner's row.
    let savedSubscription: SubscriptionDocument;
    try {
      savedSubscription = await this.create(subscriptionData);
    } catch (error: unknown) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }

      const winner = await this.findByOrganizationId(organizationId);
      if (!winner) {
        throw error;
      }
      savedSubscription = winner;
    }

    this.logger.log(`${url} success`, {
      customerId: customer.id,
      existingCustomer: hasExistingCustomer,
      organizationId: organization.id,
      stripeCustomerId,
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
      where: scopedWhere(customer.organizationId, {
        customerId: String(customer.id),
      }),
    });
    return result ? await this.normalizeSubscriptionDocument(result) : null;
  }

  async syncWithStripe(
    subscription: ISubscriptionOssReadModel,
  ): Promise<ISubscriptionOssReadModel> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const stripeCustomer = await this.stripeService.retrieveCustomer(
        this.requireString(
          await this.resolveStripeCustomerId(
            subscription.customerId,
            subscription.organizationId,
          ),
          'Subscription stripeCustomerId',
        ),
      );

      if (!stripeCustomer) {
        throw new NotFoundException({
          message: 'Customer not found in Stripe',
        });
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
        throw new NotFoundException('Subscription');
      }

      if (!subscription.stripeSubscriptionId) {
        throw new BadRequestException('No active Stripe subscription found');
      }

      const newPrice = await this.stripeService.getPrice(newPriceId);
      const recurringInterval = newPrice.recurring?.interval;
      if (recurringInterval !== 'month' && recurringInterval !== 'year') {
        throw new BadRequestException(
          'Subscription price must use a monthly or yearly billing interval',
        );
      }
      const newPlan =
        recurringInterval === 'year'
          ? SubscriptionPlan.YEARLY
          : SubscriptionPlan.MONTHLY;

      // Change the plan in Stripe with pro-rata billing
      const updatedStripeSubscription =
        await this.stripeService.changeSubscriptionPlan(
          subscription.stripeSubscriptionId,
          newPriceId,
          'create_prorations',
        );

      // Update our local subscription record
      const updatedSubscription = await this.patch(subscription.id.toString(), {
        currentPeriodEnd: updatedStripeSubscription.items.data[0]
          ?.current_period_end
          ? new Date(
              updatedStripeSubscription.items.data[0].current_period_end * 1000,
            )
          : undefined,
        status: toPrismaSubscriptionStatus(updatedStripeSubscription.status),
        stripePriceId: newPriceId,
        plan: newPlan,
      });

      // Sync subscription state to DB
      await this.syncSubscriptionState(updatedSubscription);

      // Reset credits to the new allocation when the plan changes. The new
      // allocation is whatever the customer's new Stripe price includes — a
      // price we cannot resolve leaves the existing balance alone rather than
      // resetting it to a default unrelated to what they now pay.
      const previousPlan = subscription.plan ?? undefined;
      const previousPriceId = subscription.stripePriceId ?? undefined;
      if (newPriceId !== previousPriceId) {
        const creditsForNewPlan =
          (await this.creditGrantService.resolvePlanCredits(
            newPlan,
            newPriceId,
          )) ?? 0;
        const source =
          newPlan === SubscriptionPlan.YEARLY
            ? 'change_to_yearly'
            : 'change_to_monthly';

        if (creditsForNewPlan <= 0) {
          this.creditGrantService.logUnresolvedGrant(url, {
            organizationId,
            stripePriceId: newPriceId,
          });
        }

        if (creditsForNewPlan > 0) {
          await this.creditsUtilsService.resetOrganizationCredits(
            organizationId,
            creditsForNewPlan,
            source,
            `Credits reset due to subscription price change from ${previousPriceId ?? 'unknown'} to ${newPriceId} (${previousPlan ?? 'unknown'} to ${newPlan})`,
          );

          this.logger.log(`${url} credits reset for plan change`, {
            newCredits: creditsForNewPlan,
            newPlan,
            oldPlan: previousPlan,
            organizationId,
            source,
          });
        }
      }

      this.logger.log(`${url} success`, {
        newPriceId,
        newPlan,
        oldPriceId: previousPriceId,
        oldPlan: previousPlan,
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
  ): Promise<SubscriptionChangePreview> {
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

      const currentPriceId = this.requireString(
        subscription.stripePriceId,
        'Subscription stripePriceId',
      );

      // Get the upcoming invoice preview
      const upcomingInvoice = await this.stripeService.getUpcomingInvoice(
        this.requireString(
          await this.resolveStripeCustomerId(
            subscription.customerId,
            subscription.organizationId,
          ),
          'Subscription stripeCustomerId',
        ),
        subscription.stripeSubscriptionId,
        currentPriceId,
        newPriceId,
      );

      const [currentPrice, newPrice] = await Promise.all([
        this.stripeService.getPrice(currentPriceId),
        this.stripeService.getPrice(newPriceId),
      ]);
      const prorationAmount = upcomingInvoice.lines.data.reduce(
        (amount, line) =>
          line.parent?.subscription_item_details?.proration
            ? amount + line.amount
            : amount,
        0,
      );
      let priceDifference: number | null = null;
      if (
        currentPrice.unit_amount !== null &&
        newPrice.unit_amount !== null &&
        currentPrice.currency === newPrice.currency &&
        currentPrice.recurring !== null &&
        newPrice.recurring !== null &&
        currentPrice.recurring.interval === newPrice.recurring.interval &&
        currentPrice.recurring.interval_count ===
          newPrice.recurring.interval_count
      ) {
        priceDifference = newPrice.unit_amount - currentPrice.unit_amount;
      }
      const pricesComparable = priceDifference !== null;
      const isUpgrade = priceDifference !== null && priceDifference > 0;
      const isDowngrade = priceDifference !== null && priceDifference < 0;

      this.logger.log(`${url} success`, {
        currentPriceId: currentPrice?.id,
        isDowngrade,
        isUpgrade,
        newPriceId,
        pricesComparable,
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
