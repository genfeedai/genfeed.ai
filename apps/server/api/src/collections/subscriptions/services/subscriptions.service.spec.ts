import { CustomersService } from '@api/collections/customers/services/customers.service';
import { Subscription } from '@api/collections/subscriptions/schemas/subscription.schema';
import { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let model: ReturnType<typeof createMockModel>;

  const createModule = async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: PrismaService, useValue: model },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        { provide: ConfigService, useValue: { get: vi.fn() } },
        {
          provide: StripeService,
          useValue: {
            createSubscription: vi.fn(),
          },
        },
        {
          provide: ClerkService,
          useValue: {
            getUserById: vi.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findOne: vi.fn(),
          },
        },
        {
          provide: CustomersService,
          useValue: {
            findOne: vi.fn(),
          },
        },
      ],
    }).compile();
    service = module.get<SubscriptionsService>(SubscriptionsService);
  };

  beforeEach(async () => {
    model = vi.fn().mockImplementation(function () {
      return { save: vi.fn().mockResolvedValue({ _id: 'saved-id' }) };
    });
    model.collection = { name: 'subscriptions' };
    model.modelName = 'Subscription';
    model.aggregate = vi.fn().mockReturnValue('agg');
    model.aggregatePaginate = vi.fn();
    model.findOne = vi.fn().mockReturnValue({
      exec: vi.fn(),
      populate: vi.fn().mockReturnThis(),
    });
    model.findByIdAndUpdate = vi.fn().mockReturnValue({
      exec: vi.fn(),
      populate: vi.fn().mockReturnThis(),
    });
    await createModule();
  });

  it('creates a subscription', async () => {
    const saved = { _id: '1' };
    const saveMock = vi.fn().mockResolvedValue(saved);
    model.mockImplementation(function () {
      return { save: saveMock };
    });

    const result = await service.create({});

    expect(saveMock).toHaveBeenCalled();
    expect(result).toBe(saved);
  });

  it('finds all subscriptions', async () => {
    model.aggregatePaginate.mockResolvedValue('data');
    const result = await service.findAll([], {});
    expect(model.aggregate).toHaveBeenCalledWith([]);
    expect(model.aggregatePaginate).toHaveBeenCalledWith('agg', {});
    expect(result).toBe('data');
  });

  it('finds one subscription', async () => {
    model.findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue('sub') });
    const result = await service.findOne({ _id: '1' });
    expect(model.findOne).toHaveBeenCalledWith({ _id: '1' });
    expect(result).toBe('sub');
  });

  it('patches a subscription', async () => {
    const execMock = vi.fn().mockResolvedValue('sub2');
    model.findByIdAndUpdate.mockReturnValue({
      exec: execMock,
      populate: vi.fn().mockReturnValue({ exec: execMock }),
    });
    const result = await service.patch('1', {});
    expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
      '1',
      { $set: {} },
      { returnDocument: 'after' },
    );
    expect(result).toBe('sub2');
  });

  it('changes plan from monthly to yearly', async () => {
    const subscription = {
      _id: 'sub1',
      stripeCustomerId: 'cust1',
      stripePriceId: 'monthly_id',
      stripeSubscriptionId: 'stripeSub',
      type: 'monthly',
    };
    vi.spyOn(service, 'findByOrganizationId').mockResolvedValue(subscription);

    const mockStripeSubscription = {
      items: { data: [{ current_period_end: 1700000000 }] },
      status: 'active',
    };
    const stripeChange = vi.fn().mockResolvedValue(mockStripeSubscription);
    service.stripeService = {
      changeSubscriptionPlan: stripeChange,
    };

    const patched = {
      ...subscription,
      stripePriceId: 'yearly_id',
      type: 'yearly',
    };
    vi.spyOn(service, 'patch').mockResolvedValue(patched);

    const result = await service.changeSubscriptionPlan('org1', 'yearly_id');

    expect(stripeChange).toHaveBeenCalledWith(
      'stripeSub',
      'yearly_id',
      'create_prorations',
    );
    expect(service.patch).toHaveBeenCalledWith(
      'sub1',
      expect.objectContaining({ stripePriceId: 'yearly_id', type: 'yearly' }),
    );
    expect(result).toEqual({
      stripeSubscription: mockStripeSubscription,
      subscription: patched,
    });
  });

  it('changes plan from yearly to monthly', async () => {
    const subscription = {
      _id: 'sub2',
      stripeCustomerId: 'cust2',
      stripePriceId: 'yearly_id',
      stripeSubscriptionId: 'stripeSub2',
      type: 'yearly',
    };
    vi.spyOn(service, 'findByOrganizationId').mockResolvedValue(subscription);

    const mockStripeSubscription2 = {
      items: { data: [] },
      status: 'active',
    };
    const stripeChange = vi.fn().mockResolvedValue(mockStripeSubscription2);
    service.stripeService = {
      changeSubscriptionPlan: stripeChange,
    };

    const patched = {
      ...subscription,
      stripePriceId: 'monthly_id',
      type: 'monthly',
    };
    vi.spyOn(service, 'patch').mockResolvedValue(patched);

    const result = await service.changeSubscriptionPlan('org1', 'monthly_id');

    expect(stripeChange).toHaveBeenCalledWith(
      'stripeSub2',
      'monthly_id',
      'create_prorations',
    );
    expect(service.patch).toHaveBeenCalledWith(
      'sub2',
      expect.objectContaining({ stripePriceId: 'monthly_id', type: 'monthly' }),
    );
    expect(result).toEqual({
      stripeSubscription: mockStripeSubscription2,
      subscription: patched,
    });
  });
});
