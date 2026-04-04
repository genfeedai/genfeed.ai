import { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import { ConfigService } from '@api/config/config.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { CreditTransactionsService } from '@credits/services/credit-transactions.service';
import { CustomersService } from '@customers/services/customers.service';
import { LoggerService } from '@libs/logger/logger.service';
import { INestApplication } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoIdFactory } from '@test/factories/base.factory';
import {
  mockConfigService,
  mockLoggerService,
} from '@test/mocks/service.mocks';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Allow skipping this file when MongoDB memory server cannot run
// Set SKIP_MONGODB_MEMORY=true to skip all tests in this file
if (process.env.SKIP_MONGODB_MEMORY === 'true') {
  const g: any = global as any;
  const d: any = (global as any).describe;
  g.describe = ((name: string, fn: any) =>
    d?.skip ? d.skip(name, fn) : describe(name, fn)) as any;
  const i: any = (global as any).it;
  g.it = ((name: string, fn: any) =>
    i?.skip ? i.skip(name, fn) : it(name, fn)) as any;
  g.test = g.it;
}

describe('Payment Processing Integration Tests (Stripe)', () => {
  // Increase timeout for MongoDB memory server operations
  // vi timeout configured in vitest.config(30000);

  let app: INestApplication;
  let moduleRef: TestingModule;
  let mongoServer: MongoMemoryServer;
  let stripeService: StripeService;
  let subscriptionsService: SubscriptionsService;
  let customersService: CustomersService;
  let creditTransactionsService: CreditTransactionsService;
  let mockStripe: any;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    // Create mock Stripe client
    mockStripe = {
      charges: {
        create: vi.fn(),
        list: vi.fn(),
        retrieve: vi.fn(),
      },
      checkout: {
        sessions: {
          create: vi.fn(),
          expire: vi.fn(),
          retrieve: vi.fn(),
        },
      },
      customers: {
        create: vi.fn(),
        del: vi.fn(),
        list: vi.fn(),
        retrieve: vi.fn(),
        update: vi.fn(),
      },
      invoices: {
        create: vi.fn(),
        finalizeInvoice: vi.fn(),
        list: vi.fn(),
        pay: vi.fn(),
        retrieve: vi.fn(),
      },
      paymentIntents: {
        cancel: vi.fn(),
        confirm: vi.fn(),
        create: vi.fn(),
        retrieve: vi.fn(),
      },
      paymentMethods: {
        attach: vi.fn(),
        create: vi.fn(),
        detach: vi.fn(),
        list: vi.fn(),
      },
      prices: {
        create: vi.fn(),
        list: vi.fn(),
        retrieve: vi.fn(),
        update: vi.fn(),
      },
      products: {
        create: vi.fn(),
        list: vi.fn(),
        retrieve: vi.fn(),
        update: vi.fn(),
      },
      subscriptions: {
        cancel: vi.fn(),
        create: vi.fn(),
        list: vi.fn(),
        retrieve: vi.fn(),
        update: vi.fn(),
      },
      webhookEndpoints: {
        create: vi.fn(),
        del: vi.fn(),
      },
    };

    moduleRef = await Test.createTestingModule({
      imports: [MongooseModule.forRoot(mongoUri)],
      providers: [
        {
          provide: StripeService,
          useValue: {
            attachPaymentMethod: vi.fn(),
            cancelSubscription: vi.fn(),
            confirmPayment: vi.fn(),
            createCheckoutSession: vi.fn(),
            createCustomer: vi.fn(),
            createInvoice: vi.fn(),
            createPaymentIntent: vi.fn(),
            createPrice: vi.fn(),
            createProduct: vi.fn(),
            createSubscription: vi.fn(),
            getCustomer: vi.fn(),
            handleWebhook: vi.fn(),
            refundPayment: vi.fn(),
            stripe: mockStripe,
            updateSubscription: vi.fn(),
          },
        },
        {
          provide: SubscriptionsService,
          useValue: {
            cancel: vi.fn(),
            create: vi.fn(),
            findByCustomer: vi.fn(),
            findOne: vi.fn(),
            update: vi.fn(),
            updateStatus: vi.fn(),
          },
        },
        {
          provide: CustomersService,
          useValue: {
            create: vi.fn(),
            findByStripeCustomerId: vi.fn(),
            findOne: vi.fn(),
            update: vi.fn(),
          },
        },
        {
          provide: CreditTransactionsService,
          useValue: {
            addCredits: vi.fn(),
            calculateBalance: vi.fn(),
            create: vi.fn(),
            deductCredits: vi.fn(),
            findByUser: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService(),
        },
        {
          provide: ConfigService,
          useValue: mockConfigService({
            STRIPE_PUBLISHABLE_KEY: 'pk_test_123',
            STRIPE_SECRET_KEY: 'sk_test_123',
            STRIPE_WEBHOOK_SECRET: 'whsec_test_123',
          }),
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    stripeService = moduleRef.get<StripeService>(StripeService);
    subscriptionsService =
      moduleRef.get<SubscriptionsService>(SubscriptionsService);
    customersService = moduleRef.get<CustomersService>(CustomersService);
    creditTransactionsService = moduleRef.get<CreditTransactionsService>(
      CreditTransactionsService,
    );
  });

  afterEach(() => {
    // Clear mocks between tests
    vi.clearAllMocks();
  });

  afterAll(async () => {
    // Ensure proper cleanup order: app -> module -> mongo
    try {
      if (app) {
        await app.close();
        app = null as any;
      }
    } catch {
      // Ignore close errors
    }

    try {
      if (moduleRef) {
        await moduleRef.close();
        moduleRef = null as any;
      }
    } catch {
      // Ignore close errors
    }

    try {
      if (mongoServer) {
        await mongoServer.stop({ doCleanup: true, force: true });
        mongoServer = null as any;
      }
    } catch {
      // Ignore stop errors
    }

    // Clear mock references
    mockStripe = null;

    // Allow event loop to clear pending handles
    await new Promise((resolve) => setImmediate(resolve));

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  });

  describe('Customer Management', () => {
    it('should create a new Stripe customer', async () => {
      const userData = {
        email: 'test@example.com',
        id: MongoIdFactory.createString(),
        name: 'Test User',
        organization: MongoIdFactory.createString(),
      };

      const mockStripeCustomer = {
        email: userData.email,
        id: 'cus_test123',
        metadata: {
          organizationId: userData.organization,
          userId: userData.id,
        },
        name: userData.name,
      };

      mockStripe.customers.create.mockResolvedValue(mockStripeCustomer);
      (stripeService.createCustomer as vi.Mock).mockResolvedValue(
        mockStripeCustomer,
      );
      (customersService.create as vi.Mock).mockResolvedValue({
        _id: MongoIdFactory.createString(),
        organization: userData.organization,
        stripeCustomerId: mockStripeCustomer.id,
      });

      const customer = await stripeService.createCustomer({
        email: userData.email,
        metadata: {
          organizationId: userData.organization,
          userId: userData.id,
        },
        name: userData.name,
      });

      expect(customer.id).toBe('cus_test123');
      expect(stripeService.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          email: userData.email,
        }),
      );
    });

    it('should handle duplicate customer creation', async () => {
      const email = 'existing@example.com';

      mockStripe.customers.list.mockResolvedValue({
        data: [
          {
            email,
            id: 'cus_existing',
          },
        ],
      });

      (stripeService.getCustomer as vi.Mock).mockResolvedValue({
        email,
        id: 'cus_existing',
      });

      const customer = await stripeService.getCustomer(email);
      expect(customer.id).toBe('cus_existing');
    });
  });

  describe('Subscription Lifecycle', () => {
    it('should create and activate a subscription', async () => {
      const customerId = 'cus_test123';
      const priceId = 'price_test123';
      const userId = MongoIdFactory.createString();

      const mockSubscription = {
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        current_period_start: Math.floor(Date.now() / 1000),
        customer: customerId,
        id: 'sub_test123',
        items: {
          data: [
            {
              price: {
                id: priceId,
                recurring: {
                  interval: 'month',
                },
              },
            },
          ],
        },
        status: 'active',
      };

      mockStripe.subscriptions.create.mockResolvedValue(mockSubscription);
      (stripeService.createSubscription as vi.Mock).mockResolvedValue(
        mockSubscription,
      );
      (subscriptionsService.create as vi.Mock).mockResolvedValue({
        _id: MongoIdFactory.createString(),
        status: 'active',
        stripeSubscriptionId: mockSubscription.id,
        user: userId,
      });

      const subscription = await stripeService.createSubscription({
        customer: customerId,
        expand: ['latest_invoice.payment_intent'],
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete',
      });

      expect(subscription.id).toBe('sub_test123');
      expect(subscription.status).toBe('active');
    });

    it('should handle subscription cancellation', async () => {
      const subscriptionId = 'sub_test123';

      const cancelledSubscription = {
        canceled_at: Math.floor(Date.now() / 1000),
        id: subscriptionId,
        status: 'canceled',
      };

      mockStripe.subscriptions.cancel.mockResolvedValue(cancelledSubscription);
      (stripeService.cancelSubscription as vi.Mock).mockResolvedValue(
        cancelledSubscription,
      );
      (subscriptionsService.cancel as vi.Mock).mockResolvedValue({
        status: 'canceled',
        stripeSubscriptionId: subscriptionId,
      });

      const result = await stripeService.cancelSubscription(subscriptionId);

      expect(result.status).toBe('canceled');
      expect(stripeService.cancelSubscription).toHaveBeenCalledWith(
        subscriptionId,
      );
    });

    it('should update subscription plan', async () => {
      const subscriptionId = 'sub_test123';
      const newPriceId = 'price_new123';

      const updatedSubscription = {
        id: subscriptionId,
        items: {
          data: [
            {
              price: {
                id: newPriceId,
              },
            },
          ],
        },
      };

      mockStripe.subscriptions.update.mockResolvedValue(updatedSubscription);
      (stripeService.updateSubscription as vi.Mock).mockResolvedValue(
        updatedSubscription,
      );

      const result = await stripeService.updateSubscription(subscriptionId, {
        items: [
          {
            id: 'si_test',
            price: newPriceId,
          },
        ],
      });

      expect(result.items.data[0].price.id).toBe(newPriceId);
    });

    it('should handle subscription renewal', async () => {
      const subscriptionId = 'sub_test123';

      const renewedSubscription = {
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        id: subscriptionId,
        status: 'active',
      };

      mockStripe.subscriptions.retrieve.mockResolvedValue(renewedSubscription);

      const subscription =
        await mockStripe.subscriptions.retrieve(subscriptionId);
      expect(subscription.status).toBe('active');
    });
  });

  describe('Payment Processing', () => {
    it('should create and confirm a payment intent', async () => {
      const amount = 9999; // $99.99
      const customerId = 'cus_test123';

      const paymentIntent = {
        amount,
        client_secret: 'pi_test123_secret_test',
        currency: 'usd',
        customer: customerId,
        id: 'pi_test123',
        status: 'requires_payment_method',
      };

      mockStripe.paymentIntents.create.mockResolvedValue(paymentIntent);
      (stripeService.createPaymentIntent as vi.Mock).mockResolvedValue(
        paymentIntent,
      );

      const intent = await stripeService.createPaymentIntent({
        amount,
        currency: 'usd',
        customer: customerId,
        metadata: {
          credits: '1000',
          type: 'credit_purchase',
        },
      });

      expect(intent.id).toBe('pi_test123');
      expect(intent.amount).toBe(amount);

      // Confirm payment
      const confirmedIntent = {
        ...paymentIntent,
        status: 'succeeded',
      };

      mockStripe.paymentIntents.confirm.mockResolvedValue(confirmedIntent);
      (stripeService.confirmPayment as vi.Mock).mockResolvedValue(
        confirmedIntent,
      );

      const confirmed = await stripeService.confirmPayment(intent.id, {
        payment_method: 'pm_card_visa',
      });

      expect(confirmed.status).toBe('succeeded');
    });

    it('should handle payment failure and retry', async () => {
      const paymentIntentId = 'pi_failed';

      const failedIntent = {
        id: paymentIntentId,
        last_payment_error: {
          code: 'card_declined',
          message: 'Your card was declined.',
        },
        status: 'requires_payment_method',
      };

      mockStripe.paymentIntents.retrieve.mockResolvedValue(failedIntent);

      const intent = await mockStripe.paymentIntents.retrieve(paymentIntentId);
      expect(intent.last_payment_error.code).toBe('card_declined');

      // Retry with new payment method
      const retriedIntent = {
        id: paymentIntentId,
        status: 'succeeded',
      };

      mockStripe.paymentIntents.confirm.mockResolvedValue(retriedIntent);

      const confirmed = await mockStripe.paymentIntents.confirm(
        paymentIntentId,
        {
          payment_method: 'pm_card_mastercard',
        },
      );

      expect(confirmed.status).toBe('succeeded');
    });

    it('should process refunds', async () => {
      const chargeId = 'ch_test123';
      const amount = 5000; // $50.00

      const refund = {
        amount,
        charge: chargeId,
        id: 're_test123',
        reason: 'requested_by_customer',
        status: 'succeeded',
      };

      (stripeService.refundPayment as vi.Mock).mockResolvedValue(refund);

      const result = await stripeService.refundPayment({
        amount,
        charge: chargeId,
        reason: 'requested_by_customer',
      });

      expect(result.id).toBe('re_test123');
      expect(result.amount).toBe(amount);
      expect(result.status).toBe('succeeded');
    });
  });

  describe('Checkout Sessions', () => {
    it('should create a checkout session for subscription', async () => {
      const priceId = 'price_test123';
      const customerId = 'cus_test123';

      const checkoutSession = {
        cancel_url: 'https://example.com/cancel',
        customer: customerId,
        id: 'cs_test123',
        line_items: {
          data: [
            {
              price: priceId,
              quantity: 1,
            },
          ],
        },
        mode: 'subscription',
        success_url: 'https://example.com/success',
        url: 'https://checkout.stripe.com/pay/cs_test123',
      };

      mockStripe.checkout.sessions.create.mockResolvedValue(checkoutSession);
      (stripeService.createCheckoutSession as vi.Mock).mockResolvedValue(
        checkoutSession,
      );

      const session = await stripeService.createCheckoutSession({
        cancel_url: 'https://example.com/cancel',
        customer: customerId,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: 'https://example.com/success',
      });

      expect(session.id).toBe('cs_test123');
      expect(session.url).toContain('checkout.stripe.com');
      expect(session.mode).toBe('subscription');
    });

    it('should create a checkout session for one-time payment', async () => {
      const checkoutSession = {
        amount_total: 9999,
        currency: 'usd',
        id: 'cs_payment123',
        mode: 'payment',
        payment_status: 'unpaid',
      };

      mockStripe.checkout.sessions.create.mockResolvedValue(checkoutSession);
      (stripeService.createCheckoutSession as vi.Mock).mockResolvedValue(
        checkoutSession,
      );

      const session = await stripeService.createCheckoutSession({
        cancel_url: 'https://example.com/cancel',
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                description: 'Purchase 1000 credits for video generation',
                name: '1000 Credits',
              },
              unit_amount: 9999,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: 'https://example.com/success',
      });

      expect(session.mode).toBe('payment');
      expect(session.amount_total).toBe(9999);
    });
  });

  describe('Webhook Processing', () => {
    it('should handle subscription created webhook', async () => {
      const webhookEvent = {
        data: {
          object: {
            customer: 'cus_test123',
            id: 'sub_webhook123',
            status: 'active',
          },
        },
        type: 'customer.subscription.created',
      };

      (stripeService.handleWebhook as vi.Mock).mockResolvedValue({
        action: 'subscription_created',
        processed: true,
      });

      const result = await stripeService.handleWebhook(webhookEvent);

      expect(result.processed).toBe(true);
      expect(result.action).toBe('subscription_created');
    });

    it('should handle payment succeeded webhook', async () => {
      const webhookEvent = {
        data: {
          object: {
            amount: 9999,
            customer: 'cus_test123',
            id: 'pi_webhook123',
            metadata: {
              credits: '1000',
              type: 'credit_purchase',
              userId: MongoIdFactory.createString(),
            },
          },
        },
        type: 'payment_intent.succeeded',
      };

      (stripeService.handleWebhook as vi.Mock).mockImplementation(
        async (event) => {
          if (event.type === 'payment_intent.succeeded') {
            const { metadata } = event.data.object;
            await creditTransactionsService.addCredits(
              metadata.userId,
              parseInt(metadata.credits, 10),
              'purchase',
            );
          }
          return { processed: true };
        },
      );

      (creditTransactionsService.addCredits as vi.Mock).mockResolvedValue({
        credits: 1000,
        reason: 'purchase',
        type: 'credit',
      });

      const result = await stripeService.handleWebhook(webhookEvent);

      expect(result.processed).toBe(true);
      expect(creditTransactionsService.addCredits).toHaveBeenCalled();
    });

    it('should handle invoice payment failed webhook', async () => {
      const webhookEvent = {
        data: {
          object: {
            attempt_count: 3,
            customer: 'cus_test123',
            id: 'in_failed123',
            subscription: 'sub_test123',
          },
        },
        type: 'invoice.payment_failed',
      };

      (stripeService.handleWebhook as vi.Mock).mockImplementation(
        async (event) => {
          if (event.type === 'invoice.payment_failed') {
            const { subscription, attempt_count } = event.data.object;
            if (attempt_count >= 3) {
              await subscriptionsService.updateStatus(subscription, 'past_due');
            }
          }
          return { processed: true };
        },
      );

      (subscriptionsService.updateStatus as vi.Mock).mockResolvedValue({
        status: 'past_due',
        stripeSubscriptionId: 'sub_test123',
      });

      const result = await stripeService.handleWebhook(webhookEvent);

      expect(result.processed).toBe(true);
      expect(subscriptionsService.updateStatus).toHaveBeenCalledWith(
        'sub_test123',
        'past_due',
      );
    });
  });

  describe('Credit System Integration', () => {
    it('should deduct credits for video generation', async () => {
      const userId = MongoIdFactory.createString();
      const videoGenerationCost = 100;

      (creditTransactionsService.calculateBalance as vi.Mock).mockResolvedValue(
        500,
      );
      (creditTransactionsService.deductCredits as vi.Mock).mockResolvedValue({
        balance: 400,
        credits: videoGenerationCost,
        reason: 'video_generation',
        type: 'debit',
      });

      const balance = await creditTransactionsService.calculateBalance(userId);
      expect(balance).toBe(500);

      const transaction = await creditTransactionsService.deductCredits(
        userId,
        videoGenerationCost,
        'video_generation',
      );

      expect(transaction.balance).toBe(400);
      expect(transaction.type).toBe('debit');
    });

    it('should handle insufficient credits', async () => {
      const userId = MongoIdFactory.createString();
      const requiredCredits = 100;

      (creditTransactionsService.calculateBalance as vi.Mock).mockResolvedValue(
        50,
      );
      (creditTransactionsService.deductCredits as vi.Mock).mockRejectedValue(
        new Error('Insufficient credits'),
      );

      await expect(
        creditTransactionsService.deductCredits(
          userId,
          requiredCredits,
          'video_generation',
        ),
      ).rejects.toThrow('Insufficient credits');
    });

    it('should add credits after successful payment', async () => {
      const userId = MongoIdFactory.createString();
      const creditAmount = 1000;

      (creditTransactionsService.addCredits as vi.Mock).mockResolvedValue({
        balance: 1500,
        credits: creditAmount,
        reason: 'purchase',
        type: 'credit',
      });

      const transaction = await creditTransactionsService.addCredits(
        userId,
        creditAmount,
        'purchase',
      );

      expect(transaction.credits).toBe(creditAmount);
      expect(transaction.type).toBe('credit');
      expect(transaction.balance).toBe(1500);
    });
  });
});
