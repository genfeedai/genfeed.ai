import {
  getCheckoutRedirectBaseUrls,
  isLoopbackRedirectUrl,
  resolveAllowedRedirectUrl,
} from '@api/helpers/utils/checkout-redirect/checkout-redirect.util';
import { CacheService } from '@api/services/cache/cache.service';
import { CreateManagedCheckoutDto } from '@api/services/integrations/stripe/dto/create-managed-checkout.dto';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { LifecycleEmailService } from '@api/services/lifecycle-emails/lifecycle-email.service';
import { isSelfHostedDeployment } from '@genfeedai/config';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import {
  BadRequestException,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';

const MANAGED_CHECKOUT_RESULT_TTL_SECONDS = 60 * 60;
const MANAGED_CHECKOUT_PROCESSED_TTL_SECONDS = 60 * 60 * 24 * 7;
const MANAGED_CHECKOUT_LOCK_TTL_SECONDS = 60 * 5;
const MANAGED_CHECKOUT_NAMESPACE = 'managed-checkout';

export interface ManagedCheckoutResult {
  apiKey: string | null;
  apiKeyAlreadyExists: boolean;
  brandId: string;
  email: string;
  organizationId: string;
  userId: string;
}

@Traced()
@Injectable()
export class ManagedStripeCheckoutService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly configService: ConfigService,
    private readonly stripeService: StripeService,
    private readonly cacheService: CacheService,
    private readonly loggerService: LoggerService,
    @Optional()
    private readonly lifecycleEmailService?: LifecycleEmailService,
  ) {}

  async createCheckoutSession(
    dto: CreateManagedCheckoutDto,
  ): Promise<{ url: string }> {
    if (isSelfHostedDeployment()) {
      throw new ServiceUnavailableException(
        'Managed credit checkout is available from Genfeed Cloud, not the local self-hosted API.',
      );
    }

    // The endpoint is public: only the configured PAYG price may be charged,
    // and the buyer may only be sent back to a configured Genfeed origin.
    const stripePriceId = this.configService.get('STRIPE_PRICE_PAYG');

    if (!stripePriceId) {
      throw new BadRequestException(
        'Managed checkout is not configured. No Stripe price ID found.',
      );
    }

    if (dto.stripePriceId && dto.stripePriceId !== stripePriceId) {
      throw new BadRequestException(
        'Stripe price ID is not available for managed checkout.',
      );
    }

    const appUrl = this.configService.get('GENFEEDAI_APP_URL');
    const redirectBaseUrls = getCheckoutRedirectBaseUrls(this.configService);

    const session = await this.stripeService.createManagedPaymentSession({
      // A self-hosted install on the buyer's own machine is sent back to
      // itself; any other foreign origin falls back to the hosted pages.
      cancelUrl: isLoopbackRedirectUrl(dto.cancelUrl)
        ? (dto.cancelUrl as string)
        : resolveAllowedRedirectUrl(
            dto.cancelUrl,
            `${appUrl}${APP_ROUTES.SETTINGS.CREDITS}`,
            redirectBaseUrls,
          ),
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      quantity: dto.quantity,
      stripePriceId,
      successUrl: isLoopbackRedirectUrl(dto.successUrl)
        ? (dto.successUrl as string)
        : resolveAllowedRedirectUrl(
            dto.successUrl,
            `${appUrl}${APP_ROUTES.MANAGED_CREDITS_SUCCESS}?session_id={CHECKOUT_SESSION_ID}`,
            redirectBaseUrls,
          ),
    });

    await this.lifecycleEmailService?.recordManagedCheckoutStartedByEmail({
      checkoutSessionId: session.id,
      checkoutUrl: session.url,
      email: dto.email,
    });

    return { url: session.url || '' };
  }

  async getCheckoutResult(
    sessionId: string,
  ): Promise<ManagedCheckoutResult | null> {
    return await this.cacheService.get<ManagedCheckoutResult>(
      this.buildResultKey(sessionId),
    );
  }

  /**
   * Result read for the anonymous success page. The Stripe session id is the
   * only credential on that route, so the plaintext API key is handed to the
   * first reader only; later reads get the record with the key withheld
   * (`apiKeyAlreadyExists`), which the page already renders.
   */
  async claimCheckoutResult(
    sessionId: string,
  ): Promise<ManagedCheckoutResult | null> {
    const result = await this.getCheckoutResult(sessionId);

    if (!result?.apiKey) {
      return result;
    }

    const claimKey = this.buildClaimKey(sessionId);
    const claimCount = await this.cacheService.incr(claimKey, 1);

    if (claimCount === 1) {
      await this.cacheService.expire(
        claimKey,
        MANAGED_CHECKOUT_RESULT_TTL_SECONDS,
      );
      return result;
    }

    return { ...result, apiKey: null, apiKeyAlreadyExists: true };
  }

  async cacheCheckoutResult(
    sessionId: string,
    result: ManagedCheckoutResult,
  ): Promise<boolean> {
    return await this.cacheService.set(this.buildResultKey(sessionId), result, {
      tags: [`${MANAGED_CHECKOUT_NAMESPACE}:result`, sessionId],
      ttl: MANAGED_CHECKOUT_RESULT_TTL_SECONDS,
    });
  }

  async isSessionProvisioned(sessionId: string): Promise<boolean> {
    return await this.cacheService.exists(this.buildProcessedKey(sessionId));
  }

  async markSessionProvisioned(sessionId: string): Promise<boolean> {
    return await this.cacheService.set(
      this.buildProcessedKey(sessionId),
      {
        provisionedAt: new Date().toISOString(),
        sessionId,
      },
      {
        tags: [`${MANAGED_CHECKOUT_NAMESPACE}:processed`, sessionId],
        ttl: MANAGED_CHECKOUT_PROCESSED_TTL_SECONDS,
      },
    );
  }

  async withProvisioningLock<T>(
    sessionId: string,
    fn: () => Promise<T>,
  ): Promise<T | null> {
    return await this.cacheService.withLock(
      this.buildLockKey(sessionId),
      fn,
      MANAGED_CHECKOUT_LOCK_TTL_SECONDS,
    );
  }

  logProvisioningContention(sessionId: string): void {
    this.loggerService.warn(
      `${this.constructorName} lock not acquired for managed checkout`,
      { sessionId },
    );
  }

  private buildResultKey(sessionId: string): string {
    return this.cacheService.generateKey(
      MANAGED_CHECKOUT_NAMESPACE,
      'result',
      sessionId,
    );
  }

  private buildClaimKey(sessionId: string): string {
    return this.cacheService.generateKey(
      MANAGED_CHECKOUT_NAMESPACE,
      'claim',
      sessionId,
    );
  }

  private buildProcessedKey(sessionId: string): string {
    return this.cacheService.generateKey(
      MANAGED_CHECKOUT_NAMESPACE,
      'processed',
      sessionId,
    );
  }

  private buildLockKey(sessionId: string): string {
    return this.cacheService.generateKey(
      MANAGED_CHECKOUT_NAMESPACE,
      'lock',
      sessionId,
    );
  }
}
