/**
 * One answer to "how many credits does this subscription include?".
 *
 * The grant belongs to the Stripe price, not to the deployment: whoever owns
 * the Stripe account sets `included_monthly_credits` on each recurring price
 * and can reprice without a code change or a redeploy. Only when a price
 * carries no metadata do we fall back to the published tier table in
 * `@genfeedai/pricing`, and only for a price ID that a configured
 * `STRIPE_PRICE_SUBSCRIPTION_*` env actually maps to a tier.
 *
 * When neither source answers, this service returns `null` and the caller
 * grants nothing. That is deliberate. The previous behaviour — a blanket
 * `STRIPE_MONTHLY_CREDITS` env defaulting to 35,000 — silently handed every
 * unmappable subscription a grant unrelated to what the customer paid, which
 * on a $49 plan is a loss on every sale. An operator-visible warning and a
 * skipped grant are recoverable; an unattributed grant is not.
 */

import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import {
  parseSubscriptionPlan,
  SubscriptionPlan,
  SubscriptionTier,
} from '@genfeedai/contracts';
import {
  INCLUDED_MONTHLY_CREDITS_METADATA_KEY,
  parseIncludedMonthlyCredits,
  TIER_INCLUDED_MONTHLY_CREDITS,
} from '@genfeedai/pricing';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';

/**
 * Prices change about as often as the pricing page does, but credit resolution
 * sits on a user-facing GET as well as on webhooks. A short in-process TTL
 * keeps a burst of requests down to one Stripe round trip without holding a
 * stale grant long enough to matter after a reprice.
 */
const PRICE_CREDITS_CACHE_TTL_MS = 5 * 60 * 1000;

type CachedPriceCredits = {
  credits: number | null;
  expiresAt: number;
};

/** Number of months of credit granted up front per billing plan. */
const PLAN_MONTHS: Partial<Record<SubscriptionPlan, number>> = {
  [SubscriptionPlan.MONTHLY]: 1,
  [SubscriptionPlan.YEARLY]: 12,
};

export class SubscriptionCreditGrantService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly priceCreditsCache = new Map<string, CachedPriceCredits>();
  private readonly priceCreditsInFlight = new Map<
    string,
    Promise<number | null>
  >();

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly stripeService: StripeService,
  ) {}

  /**
   * Monthly credits included with a Stripe price, or `null` when neither the
   * price metadata nor the tier table can answer. Callers must treat `null` as
   * "grant nothing and tell an operator", never as zero-or-default.
   */
  async resolveMonthlyCredits(
    stripePriceId?: string | null,
  ): Promise<number | null> {
    if (!stripePriceId) {
      return null;
    }

    const cached = this.readCache(stripePriceId);
    if (cached !== undefined) {
      return cached;
    }

    const existingLookup = this.priceCreditsInFlight.get(stripePriceId);
    if (existingLookup) {
      return await existingLookup;
    }

    const lookup = this.resolveAndCacheMonthlyCredits(stripePriceId);
    this.priceCreditsInFlight.set(stripePriceId, lookup);

    try {
      return await lookup;
    } finally {
      this.priceCreditsInFlight.delete(stripePriceId);
    }
  }

  /**
   * Credits granted for one billing period of `plan`. A yearly price grants
   * twelve months of its monthly allowance up front, which is why the metadata
   * key is always expressed per month regardless of the price's interval.
   */
  async resolvePlanCredits(
    plan: string | null | undefined,
    stripePriceId?: string | null,
  ): Promise<number | null> {
    const parsedPlan = parseSubscriptionPlan(plan);
    const months = parsedPlan ? PLAN_MONTHS[parsedPlan] : undefined;
    if (!months) {
      return null;
    }

    const monthlyCredits = await this.resolveMonthlyCredits(stripePriceId);
    return monthlyCredits === null ? null : monthlyCredits * months;
  }

  /**
   * Maps a Stripe price ID to a tier using the configured
   * `STRIPE_PRICE_SUBSCRIPTION_*` envs. Unset envs contribute no mapping, so an
   * unconfigured deployment resolves `null` rather than mis-attributing a price.
   */
  resolveTierFromPriceId(
    stripePriceId?: string | null,
  ): SubscriptionTier | null {
    if (!stripePriceId) {
      return null;
    }

    const priceToTier: Record<string, SubscriptionTier> = {};
    // `as const` keeps each env key a literal, so `ConfigService.get` resolves
    // to that key's `string | undefined` rather than the union of every env
    // value type (which includes the `'true' | 'false'` boolean-ish literals).
    const configuredTiers = [
      ['STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY', SubscriptionTier.PRO],
      ['STRIPE_PRICE_SUBSCRIPTION_PRO_YEARLY', SubscriptionTier.PRO],
      ['STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY', SubscriptionTier.SCALE],
      [
        'STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY',
        SubscriptionTier.ENTERPRISE,
      ],
    ] as const;

    for (const [envKey, tier] of configuredTiers) {
      const priceId = this.configService.get(envKey);
      if (priceId) {
        priceToTier[priceId] = tier;
      }
    }

    return priceToTier[stripePriceId] ?? null;
  }

  /**
   * Logs the unresolvable grant once, at warn, with everything an operator
   * needs to fix it: which price, and which of the two sources to populate.
   */
  logUnresolvedGrant(
    url: string,
    details: { organizationId?: string; stripePriceId?: string | null },
  ): void {
    this.loggerService.warn(`${url} subscription credit grant unresolved`, {
      metadataKey: INCLUDED_MONTHLY_CREDITS_METADATA_KEY,
      organizationId: details.organizationId,
      outcome: 'missing_price_credit_metadata',
      remediation:
        'Set included_monthly_credits on the Stripe price, or map it via STRIPE_PRICE_SUBSCRIPTION_*',
      stripePriceId: details.stripePriceId,
    });
  }

  private readCache(stripePriceId: string): number | null | undefined {
    const cached = this.priceCreditsCache.get(stripePriceId);
    if (!cached) {
      return undefined;
    }

    if (cached.expiresAt <= Date.now()) {
      this.priceCreditsCache.delete(stripePriceId);
      return undefined;
    }

    return cached.credits;
  }

  private async resolveAndCacheMonthlyCredits(
    stripePriceId: string,
  ): Promise<number | null> {
    const credits =
      (await this.readPriceMetadataCredits(stripePriceId)) ??
      this.resolveTierCredits(stripePriceId);

    this.priceCreditsCache.set(stripePriceId, {
      credits,
      expiresAt: Date.now() + PRICE_CREDITS_CACHE_TTL_MS,
    });
    return credits;
  }

  private async readPriceMetadataCredits(
    stripePriceId: string,
  ): Promise<number | null> {
    try {
      const price = await this.stripeService.getPrice(stripePriceId);
      const raw = price.metadata?.[INCLUDED_MONTHLY_CREDITS_METADATA_KEY];
      const credits = parseIncludedMonthlyCredits(raw);

      if (raw !== undefined && credits === null) {
        this.loggerService.warn(
          `${this.constructorName} ignoring unusable credit metadata`,
          {
            metadataKey: INCLUDED_MONTHLY_CREDITS_METADATA_KEY,
            stripePriceId,
            value: raw,
          },
        );
      }

      return credits;
    } catch (error: unknown) {
      // A Stripe outage must not block the tier fallback below it.
      this.loggerService.error(
        `${this.constructorName} failed to read Stripe price metadata`,
        error,
        { stripePriceId },
      );
      return null;
    }
  }

  private resolveTierCredits(stripePriceId: string): number | null {
    const tier = this.resolveTierFromPriceId(stripePriceId);
    return (tier && TIER_INCLUDED_MONTHLY_CREDITS[tier]) || null;
  }
}
