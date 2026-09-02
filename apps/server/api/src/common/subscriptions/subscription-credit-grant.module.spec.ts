import { SubscriptionCreditGrantModule } from '@api/common/subscriptions/subscription-credit-grant.module';
import { SubscriptionCreditGrantService } from '@api/common/subscriptions/subscription-credit-grant.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';

type FactoryProvider = {
  inject: unknown[];
  provide: unknown;
  useFactory: (
    configService: ConfigService,
    loggerService: LoggerService,
    stripeService: StripeService,
  ) => unknown;
};

describe('SubscriptionCreditGrantModule', () => {
  it('constructs the framework-free service through an explicit factory', () => {
    const providers = Reflect.getMetadata(
      'providers',
      SubscriptionCreditGrantModule,
    ) as FactoryProvider[];
    const provider = providers.find(
      (candidate) => candidate.provide === SubscriptionCreditGrantService,
    );

    expect(provider).toEqual(
      expect.objectContaining({
        inject: [ConfigService, LoggerService, StripeService],
        provide: SubscriptionCreditGrantService,
        useFactory: expect.any(Function),
      }),
    );

    const configService = {} as ConfigService;
    const loggerService = {} as LoggerService;
    const stripeService = {} as StripeService;
    expect(
      provider?.useFactory(configService, loggerService, stripeService),
    ).toBeInstanceOf(SubscriptionCreditGrantService);
  });
});
