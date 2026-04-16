import { ConfigService } from '@api/config/config.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { CreateManagedCheckoutDto } from '@api/services/integrations/stripe/dto/create-managed-checkout.dto';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

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

@Injectable()
export class ManagedStripeCheckoutService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly configService: ConfigService,
    private readonly stripeService: StripeService,
    private readonly cacheService: CacheService,
    private readonly loggerService: LoggerService,
  ) {}

  async createCheckoutSession(
    dto: CreateManagedCheckoutDto,
  ): Promise<{ url: string }> {
    const stripePriceId =
      dto.stripePriceId || this.configService.get('STRIPE_PRICE_PAYG');

    if (!stripePriceId) {
      throw new BadRequestException(
        'Managed checkout is not configured. No Stripe price ID found.',
      );
    }

    const session = await this.stripeService.createManagedPaymentSession({
      cancelUrl: dto.cancelUrl,
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      quantity: dto.quantity,
      stripePriceId,
      successUrl: dto.successUrl,
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
