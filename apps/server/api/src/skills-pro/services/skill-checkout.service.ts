import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import {
  getCheckoutRedirectBaseUrls,
  resolveAllowedRedirectUrl,
} from '@api/helpers/utils/checkout-redirect/checkout-redirect.util';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { CreateSkillCheckoutDto } from '@api/skills-pro/dto/create-skill-checkout.dto';
import { SkillRegistryService } from '@api/skills-pro/services/skill-registry.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import StripeConstructor from 'stripe';

type StripeClient = InstanceType<typeof StripeConstructor>;
type CheckoutSession = Awaited<
  ReturnType<StripeClient['checkout']['sessions']['create']>
>;
type CheckoutSessionCreateParams = NonNullable<
  Parameters<StripeClient['checkout']['sessions']['create']>[0]
>;
type CheckoutLineItem = NonNullable<
  CheckoutSessionCreateParams['line_items']
>[number];

const STRIPE_SECRET_KEY_PATTERN = /^[sr]k_(live|test)_/;

/**
 * The Genfeed marketplace sells the Skills Pro bundle and sends the buyer back
 * to its own pages after Stripe. Its public origin is fixed, so it is listed
 * here and not read from config.
 */
const MARKETPLACE_RETURN_ORIGIN = 'https://shop.genfeed.ai';

@Traced()
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
    this.assertStripeCheckoutConfigured();

    const registry = await this.skillRegistryService.getRegistry();
    const lineItem = await this.resolveBundleLineItem();
    const entitledSlugs = registry.skills.map((skill) => skill.slug);

    const appUrl = this.configService.get('GENFEEDAI_APP_URL');
    const defaultSuccessUrl = `${appUrl}/skills-pro/success?session_id={CHECKOUT_SESSION_ID}`;
    const defaultCancelUrl = `${appUrl}/skills-pro`;
    const redirectBaseUrls = [
      ...getCheckoutRedirectBaseUrls(this.configService),
      MARKETPLACE_RETURN_ORIGIN,
    ];

    const sessionConfig: CheckoutSessionCreateParams = {
      cancel_url: resolveAllowedRedirectUrl(
        dto.cancelUrl,
        defaultCancelUrl,
        redirectBaseUrls,
      ),
      line_items: [lineItem],
      metadata: {
        bundle: 'true',
        productType: 'bundle',
        skillSlug: '',
        skillSlugs: entitledSlugs.join(','),
        type: 'skills-pro',
      },
      mode: 'payment',
      allowed_payment_method_types: ['card'],
      success_url: resolveAllowedRedirectUrl(
        dto.successUrl,
        defaultSuccessUrl,
        redirectBaseUrls,
      ),
    };

    // Promo field open so public defaults (EARLYGEN) and team codes
    // (GENFEED100) can be entered. Stripe forbids both `discounts` and
    // `allow_promotion_codes` on the same session — never force-apply.
    sessionConfig.allow_promotion_codes = true;
    delete sessionConfig.discounts;

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

  private assertStripeCheckoutConfigured(): void {
    const secretKey = this.configService.get('STRIPE_SECRET_KEY')?.trim();

    if (
      !this.stripeService.stripe ||
      !secretKey ||
      !STRIPE_SECRET_KEY_PATTERN.test(secretKey)
    ) {
      throw new ServiceUnavailableException(
        'Skills Pro checkout is not configured. Stripe secret key is missing or invalid.',
      );
    }
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
}
