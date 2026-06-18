import { ConfigService } from '@api/config/config.service';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { CreateSkillCheckoutDto } from '@api/skills-pro/dto/create-skill-checkout.dto';
import { SkillRegistryService } from '@api/skills-pro/services/skill-registry.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import StripeConstructor from 'stripe';

type StripeClient = InstanceType<typeof StripeConstructor>;
type CheckoutSession = Awaited<
  ReturnType<StripeClient['checkout']['sessions']['create']>
>;
type CheckoutSessionCreateParams = Parameters<
  StripeClient['checkout']['sessions']['create']
>[0];
type CheckoutLineItem = NonNullable<
  CheckoutSessionCreateParams['line_items']
>[number];

@Injectable()
export class SkillCheckoutService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly skillRegistryService: SkillRegistryService,
    private readonly stripeService: StripeService,
  ) {}

  @HandleErrors('create skill checkout session', 'skills-pro')
  async createCheckoutSession(
    dto: CreateSkillCheckoutDto,
  ): Promise<{ url: string }> {
    this.loggerService.log(`${this.constructorName} createCheckoutSession`);

    const lineItem = await this.resolveBundleLineItem();

    const appUrl = this.configService.get('GENFEEDAI_APP_URL');
    const defaultSuccessUrl = `${appUrl}/skills-pro/success?session_id={CHECKOUT_SESSION_ID}`;
    const defaultCancelUrl = `${appUrl}/skills-pro`;

    const sessionConfig: CheckoutSessionCreateParams = {
      cancel_url: this.resolveRedirectUrl(dto.cancelUrl, defaultCancelUrl),
      line_items: [lineItem],
      metadata: {
        bundle: 'true',
        type: 'skills-pro',
      },
      mode: 'payment',
      payment_method_types: ['card'],
      success_url: this.resolveRedirectUrl(dto.successUrl, defaultSuccessUrl),
    };

    const promotionCodeId = this.configService.get(
      'STRIPE_PROMOTION_CODE_SKILLS_PRO',
    );
    if (promotionCodeId) {
      sessionConfig.discounts = [{ promotion_code: promotionCodeId }];
    } else {
      sessionConfig.allow_promotion_codes = true;
    }

    if (dto.email) {
      sessionConfig.customer_email = dto.email;
    }

    const session: CheckoutSession =
      await this.stripeService.stripe.checkout.sessions.create(sessionConfig);

    this.loggerService.log(`${this.constructorName} checkout session created`, {
      sessionId: session.id,
    });

    return { url: session.url || '' };
  }

  private async resolveBundleLineItem(): Promise<CheckoutLineItem> {
    const envPriceId = this.configService.get('STRIPE_PRICE_SKILLS_PRO');
    if (envPriceId) {
      return { price: envPriceId, quantity: 1 };
    }

    const registryPriceId =
      await this.skillRegistryService.getBundleStripePriceId();
    if (registryPriceId) {
      return { price: registryPriceId, quantity: 1 };
    }

    const bundlePriceCents =
      await this.skillRegistryService.getBundlePriceCents();
    if (bundlePriceCents && bundlePriceCents > 0) {
      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Skills Pro Bundle',
          },
          unit_amount: bundlePriceCents,
        },
        quantity: 1,
      };
    }

    throw new BadRequestException(
      'Skills Pro checkout is not configured. No bundle price found.',
    );
  }

  private resolveRedirectUrl(
    requestedUrl: string | undefined,
    fallbackUrl: string,
  ): string {
    if (!requestedUrl) {
      return fallbackUrl;
    }

    return this.isAllowedRedirectUrl(requestedUrl) ? requestedUrl : fallbackUrl;
  }

  private isAllowedRedirectUrl(url: string): boolean {
    let requestedOrigin: string;

    try {
      requestedOrigin = new URL(url).origin;
    } catch {
      return false;
    }

    return this.getAllowedRedirectOrigins().has(requestedOrigin);
  }

  private getAllowedRedirectOrigins(): Set<string> {
    return new Set(
      [
        this.configService.get('GENFEEDAI_APP_URL'),
        this.configService.get('GENFEEDAI_PUBLIC_URL'),
      ]
        .map((url) => this.toOrigin(url))
        .filter((origin): origin is string => Boolean(origin)),
    );
  }

  private toOrigin(url: string | undefined): string | undefined {
    if (!url) {
      return undefined;
    }

    try {
      return new URL(url).origin;
    } catch {
      return undefined;
    }
  }
}
