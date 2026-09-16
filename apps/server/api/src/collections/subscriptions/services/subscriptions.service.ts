import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { CustomersService } from '@api/collections/customers/services/customers.service';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import type { CreateSubscriptionDto } from '@api/collections/subscriptions/dto/create-subscription.dto';
import type { UpdateSubscriptionDto } from '@api/collections/subscriptions/dto/update-subscription.dto';
import { SubscriptionChangeException } from '@api/collections/subscriptions/errors/subscription-change.exception';
import {
  getSubscriptionChangeFailureDiagnostics,
  SubscriptionChangeStage,
  toSubscriptionChangeException,
} from '@api/collections/subscriptions/errors/subscription-change-failure.util';
import { SubscriptionPreviewException } from '@api/collections/subscriptions/errors/subscription-preview.exception';
import {
  getSubscriptionPreviewFailureDiagnostics,
  SubscriptionPreviewStage,
  toSubscriptionPreviewException,
} from '@api/collections/subscriptions/errors/subscription-preview-failure.util';
import type { SubscriptionDocument } from '@api/collections/subscriptions/schemas/subscription.schema';
import { SubscriptionCreditGrantService } from '@api/common/subscriptions/subscription-credit-grant.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { scopedWhere } from '@api/index';
import {
  StripeService,
  type StripeSubscription,
} from '@api/services/integrations/stripe/services/stripe.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BaseService,
  type PopulateInput,
} from '@api/shared/services/base/base.service';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import {
  SubscriptionPlan,
  SubscriptionStatus,
  toPrismaSubscriptionStatus,
} from '@genfeedai/contracts';
import type { SubscriptionChangePreview } from '@genfeedai/contracts/interfaces';
import {
  type ISubscriptionFindAllOptions,
  type ISubscriptionFindAllResult,
  type ISubscriptionOssReadModel,
  type ISubscriptionPlanChangeResult,
  type ISubscriptionsService,
  SubscriptionChangeFailureCode,
  SubscriptionPlanChangeCreditsOutcome,
  SubscriptionPreviewFailureCode,
} from '@genfeedai/contracts/interfaces/billing';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common';

type SubscriptionsFindAllResult =
  AggregatePaginateResult<SubscriptionDocument> & ISubscriptionFindAllResult;

/** Mirrors the DTO/StripeService shape check; a malformed persisted id is local state, not a Stripe fault. */
const STRIPE_PRICE_ID_PATTERN = /^price_[A-Za-z0-9]+$/;

/**
 * Organization (Stripe) subscriptions service, bound to `SUBSCRIPTIONS_SERVICE`
 * when organization billing is live at runtime. Its cross-module surface is
 * locked by {@link import('@genfeedai/contracts/interfaces/billing').ISubscriptionsService}.
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
    // Prisma drops an `undefined` filter, so a blank organization would turn
    // this into an unscoped first-row read — and callers that mutate what it
    // returns would then write across tenants. Mirrors `BaseService.findOne`.
    if (!organizationId) {
      this.logger.warn(
        'findByOrganizationId called with an empty organization — returning null instead of an unscoped first-row read',
        { model: 'subscription' },
      );
      return null;
    }

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

  /**
   * Applies a plan change to Stripe and to our own row.
   *
   * The ordering matters: everything before the provider call is a local
   * precondition that leaves no trace when it fails, and everything after it
   * runs against a subscription the provider already bills at the new price.
   * A failure to record that change is therefore reported as a divergence
   * rather than a plain fault, and the change is never reversed automatically
   * — a compensating Stripe update can fail in turn and would leave reversing
   * prorations on a real invoice, so reconciliation is a deliberate act.
   */
  async changeSubscriptionPlan(
    organizationId: string,
    newPriceId: string,
  ): Promise<
    ISubscriptionPlanChangeResult<StripeSubscription, SubscriptionDocument>
  > {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    let stage: SubscriptionChangeStage | undefined;

    try {
      // An empty organization would widen the tenant-scoped lookup below, and
      // this path mutates whatever that lookup returns.
      if (!organizationId) {
        throw new SubscriptionChangeException(
          SubscriptionChangeFailureCode.ORGANIZATION_REQUIRED,
        );
      }

      const subscription = await this.findByOrganizationId(organizationId);
      if (!subscription) {
        throw new SubscriptionChangeException(
          SubscriptionChangeFailureCode.SUBSCRIPTION_MISSING,
        );
      }

      if (!subscription.stripeSubscriptionId) {
        throw new SubscriptionChangeException(
          SubscriptionChangeFailureCode.STRIPE_SUBSCRIPTION_MISSING,
        );
      }

      stage = SubscriptionChangeStage.PRICE;
      const newPrice = await this.stripeService.getPrice(newPriceId);
      stage = undefined;

      const recurringInterval = newPrice.recurring?.interval;
      if (recurringInterval !== 'month' && recurringInterval !== 'year') {
        throw new SubscriptionChangeException(
          SubscriptionChangeFailureCode.PLAN_INTERVAL_UNSUPPORTED,
        );
      }
      const newPlan =
        recurringInterval === 'year'
          ? SubscriptionPlan.YEARLY
          : SubscriptionPlan.MONTHLY;

      const previousPlan = subscription.plan ?? undefined;
      const previousPriceId = subscription.stripePriceId ?? undefined;

      // Change the plan in Stripe with pro-rata billing.
      stage = SubscriptionChangeStage.PLAN_CHANGE;
      const updatedStripeSubscription =
        await this.stripeService.changeSubscriptionPlan(
          subscription.stripeSubscriptionId,
          newPriceId,
          'create_prorations',
        );

      // From here the customer is billed on `newPriceId` whatever happens.
      stage = SubscriptionChangeStage.RECORD;
      const updatedSubscription = await this.recordPlanChange({
        newPlan,
        newPriceId,
        subscriptionId: subscription.id.toString(),
        updatedStripeSubscription,
      });
      stage = undefined;

      const creditsOutcome = await this.resetCreditsForPlanChange({
        newPlan,
        newPriceId,
        organizationId,
        previousPlan,
        previousPriceId,
        url,
      });

      this.logger.log(`${url} success`, {
        creditsOutcome,
        newPriceId,
        newPlan,
        oldPriceId: previousPriceId,
        oldPlan: previousPlan,
        subscriptionId: subscription.id,
      });

      return {
        creditsOutcome,
        stripeSubscription: updatedStripeSubscription,
        subscription: updatedSubscription,
      };
    } catch (error: unknown) {
      const exception = toSubscriptionChangeException(error, stage);
      // Safe diagnostics only: the raw error (and any Stripe payload on it)
      // stays on `exception.cause` for error tracking, never in logs.
      const context = {
        ...getSubscriptionChangeFailureDiagnostics(exception, stage),
        newPriceId,
        organizationId,
      };
      if (
        exception.code === SubscriptionChangeFailureCode.PLAN_CHANGE_FAILED ||
        exception.code ===
          SubscriptionChangeFailureCode.PLAN_CHANGE_NOT_RECORDED
      ) {
        this.logger.error(`${url} failed`, undefined, context);
      } else {
        this.logger.warn(`${url} failed`, context);
      }
      throw exception;
    }
  }

  /**
   * Writes the applied plan change to our row. Retried once because the
   * provider has already moved: a transient write failure here is the
   * difference between a consistent record and a billing divergence.
   */
  private async recordPlanChange(input: {
    newPlan: SubscriptionPlan;
    newPriceId: string;
    subscriptionId: string;
    updatedStripeSubscription: StripeSubscription;
  }): Promise<SubscriptionDocument> {
    const currentPeriodEnd =
      input.updatedStripeSubscription.items.data[0]?.current_period_end;
    const patch = {
      currentPeriodEnd: currentPeriodEnd
        ? new Date(currentPeriodEnd * 1000)
        : undefined,
      plan: input.newPlan,
      status: toPrismaSubscriptionStatus(
        input.updatedStripeSubscription.status,
      ),
      stripePriceId: input.newPriceId,
    };

    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        // Re-applying the same patch is idempotent, so a retry is safe.
        const updatedSubscription = await this.patch(
          input.subscriptionId,
          patch,
        );
        await this.syncSubscriptionState(updatedSubscription);
        return updatedSubscription;
      } catch (error: unknown) {
        lastError = error;
      }
    }

    throw lastError;
  }

  /**
   * Resets credits to the new plan's allocation. Never throws: by the time it
   * runs, the plan change is durable in Stripe and in our row, so failing the
   * request would tell the caller the change did not happen and invite a retry
   * that cannot undo it. The failure is classified and reported instead, and
   * the outcome travels back with the result.
   */
  private async resetCreditsForPlanChange(input: {
    newPlan: SubscriptionPlan;
    newPriceId: string;
    organizationId: string;
    previousPlan?: string;
    previousPriceId?: string;
    url: string;
  }): Promise<SubscriptionPlanChangeCreditsOutcome> {
    if (input.newPriceId === input.previousPriceId) {
      return SubscriptionPlanChangeCreditsOutcome.UNCHANGED;
    }

    try {
      // The new allocation is whatever the customer's new Stripe price
      // includes — a price we cannot resolve leaves the existing balance alone
      // rather than resetting it to a default unrelated to what they now pay.
      const creditsForNewPlan =
        (await this.creditGrantService.resolvePlanCredits(
          input.newPlan,
          input.newPriceId,
        )) ?? 0;

      if (creditsForNewPlan <= 0) {
        this.creditGrantService.logUnresolvedGrant(input.url, {
          organizationId: input.organizationId,
          stripePriceId: input.newPriceId,
        });
        return SubscriptionPlanChangeCreditsOutcome.UNRESOLVED;
      }

      const source =
        input.newPlan === SubscriptionPlan.YEARLY
          ? 'change_to_yearly'
          : 'change_to_monthly';

      await this.creditsUtilsService.resetOrganizationCredits(
        input.organizationId,
        creditsForNewPlan,
        source,
        `Credits reset due to subscription price change from ${input.previousPriceId ?? 'unknown'} to ${input.newPriceId} (${input.previousPlan ?? 'unknown'} to ${input.newPlan})`,
      );

      this.logger.log(`${input.url} credits reset for plan change`, {
        newCredits: creditsForNewPlan,
        newPlan: input.newPlan,
        oldPlan: input.previousPlan,
        organizationId: input.organizationId,
        source,
      });

      return SubscriptionPlanChangeCreditsOutcome.RESET;
    } catch (error: unknown) {
      const exception = toSubscriptionChangeException(
        error,
        SubscriptionChangeStage.CREDITS,
      );
      this.logger.error(
        `${input.url} plan changed but credits were not reset`,
        undefined,
        {
          ...getSubscriptionChangeFailureDiagnostics(
            exception,
            SubscriptionChangeStage.CREDITS,
          ),
          newPriceId: input.newPriceId,
          organizationId: input.organizationId,
        },
      );
      return SubscriptionPlanChangeCreditsOutcome.FAILED;
    }
  }

  /**
   * Prices a plan change without touching the subscription row, credits, or
   * Stripe state: the only provider call is a preview invoice. Every failure
   * leaves as one classified {@link SubscriptionPreviewException}. Local
   * prerequisites are checked before any Stripe call so a stale row never
   * reaches the provider, and the failing Stripe stage is recorded so the
   * classifier can tell a missing price from a missing subscription.
   */
  async previewSubscriptionChange(
    organizationId: string,
    newPriceId: string,
  ): Promise<SubscriptionChangePreview> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    let stage: SubscriptionPreviewStage | undefined;

    try {
      // An empty organization would silently widen the tenant-scoped lookup.
      if (!organizationId) {
        throw new SubscriptionPreviewException(
          SubscriptionPreviewFailureCode.ORGANIZATION_REQUIRED,
        );
      }

      const subscription = await this.findByOrganizationId(organizationId);
      if (!subscription) {
        throw new SubscriptionPreviewException(
          SubscriptionPreviewFailureCode.SUBSCRIPTION_MISSING,
        );
      }

      if (!subscription.stripeSubscriptionId) {
        throw new SubscriptionPreviewException(
          SubscriptionPreviewFailureCode.STRIPE_SUBSCRIPTION_MISSING,
        );
      }

      const currentPriceId = subscription.stripePriceId;
      if (!currentPriceId || !STRIPE_PRICE_ID_PATTERN.test(currentPriceId)) {
        throw new SubscriptionPreviewException(
          SubscriptionPreviewFailureCode.CURRENT_PRICE_MISSING,
        );
      }

      const stripeCustomerId = await this.resolveStripeCustomerId(
        subscription.customerId,
        organizationId,
      );
      if (!stripeCustomerId) {
        throw new SubscriptionPreviewException(
          SubscriptionPreviewFailureCode.BILLING_CUSTOMER_MISSING,
        );
      }

      // Resolve both prices before the preview: `getUpcomingInvoice` retrieves
      // the target price itself, and Stripe reports a missing id there with
      // `param: 'id'`, which the classifier could not tell apart from a
      // missing subscription. Pricing first pins that failure to this stage.
      stage = SubscriptionPreviewStage.PRICE;
      const [currentPrice, newPrice] = await Promise.all([
        this.stripeService.getPrice(currentPriceId),
        this.stripeService.getPrice(newPriceId),
      ]);

      // Get the upcoming invoice preview
      stage = SubscriptionPreviewStage.UPCOMING_INVOICE;
      const upcomingInvoice = await this.stripeService.getUpcomingInvoice(
        stripeCustomerId,
        subscription.stripeSubscriptionId,
        currentPriceId,
        newPriceId,
      );
      stage = undefined;

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
      const exception = toSubscriptionPreviewException(error, stage);
      // Safe diagnostics only: the raw error (and any Stripe payload on it)
      // stays on `exception.cause` for error tracking, never in logs.
      const context = {
        ...getSubscriptionPreviewFailureDiagnostics(exception, stage),
        newPriceId,
        organizationId,
      };
      if (exception.code === SubscriptionPreviewFailureCode.PREVIEW_FAILED) {
        this.logger.error(`${url} failed`, undefined, context);
      } else {
        this.logger.warn(`${url} failed`, context);
      }
      throw exception;
    }
  }
}
