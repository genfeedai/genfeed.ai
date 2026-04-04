import { ConfigService } from '@api/config/config.service';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { CreateSkillCheckoutDto } from '@api/skills-pro/dto/create-skill-checkout.dto';
import { SkillRegistryService } from '@api/skills-pro/services/skill-registry.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import Stripe from 'stripe';

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

    const priceId = await this.resolveBundlePriceId();
    if (!priceId) {
      throw new BadRequestException(
        'Skills Pro checkout is not configured. No bundle price ID found.',
      );
    }

    const defaultSuccessUrl =
      this.configService.get('GENFEEDAI_APP_URL') +
      '/skills-pro/success?session_id={CHECKOUT_SESSION_ID}';
    const defaultCancelUrl = `${this.configService.get('GENFEEDAI_APP_URL')}/skills-pro`;

    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      allow_promotion_codes: true,
      cancel_url: dto.cancelUrl || defaultCancelUrl,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        bundle: 'true',
        type: 'skills-pro',
      },
      mode: 'payment',
      payment_method_types: ['card'],
      success_url: dto.successUrl || defaultSuccessUrl,
    };

    if (dto.email) {
      sessionConfig.customer_email = dto.email;
    }

    const session =
      await this.stripeService.stripe.checkout.sessions.create(sessionConfig);

    this.loggerService.log(`${this.constructorName} checkout session created`, {
      sessionId: session.id,
    });

    return { url: session.url || '' };
  }

  private async resolveBundlePriceId(): Promise<string | undefined> {
    const envPriceId = this.configService.get('STRIPE_PRICE_SKILLS_PRO');
    if (envPriceId) {
      return envPriceId;
    }

    return this.skillRegistryService.getBundleStripePriceId();
  }
}
