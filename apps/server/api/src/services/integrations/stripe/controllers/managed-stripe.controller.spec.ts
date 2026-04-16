vi.mock('@api/helpers/decorators/swagger/auto-swagger.decorator', () => ({
  AutoSwagger: () => () => undefined,
}));

vi.mock('@api/helpers/utils/response/response.util', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@api/helpers/utils/response/response.util')
    >();
  return {
    ...actual,
    serializeSingle: vi.fn(
      (_req: unknown, _serializer: unknown, data: unknown) => data,
    ),
  };
});

import { ManagedStripeController } from '@api/services/integrations/stripe/controllers/managed-stripe.controller';
import { ManagedStripeCheckoutService } from '@api/services/integrations/stripe/services/managed-stripe-checkout.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('ManagedStripeController', () => {
  let controller: ManagedStripeController;
  let managedStripeCheckoutService: {
    createCheckoutSession: ReturnType<typeof vi.fn>;
    getCheckoutResult: ReturnType<typeof vi.fn>;
  };

  const makeReq = (ip: string): Partial<Request> => ({ ip });

  beforeEach(async () => {
    managedStripeCheckoutService = {
      createCheckoutSession: vi.fn(),
      getCheckoutResult: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ManagedStripeController],
      providers: [
        {
          provide: ManagedStripeCheckoutService,
          useValue: managedStripeCheckoutService,
        },
      ],
    }).compile();

    controller = module.get<ManagedStripeController>(ManagedStripeController);
    vi.clearAllMocks();
  });

  it('creates a managed checkout session', async () => {
    managedStripeCheckoutService.createCheckoutSession.mockResolvedValue({
      url: 'https://checkout.stripe.com/pay/managed',
    });

    const dto = {
      email: 'managed@example.com',
      quantity: 99_900,
    };

    const result = await controller.createCheckout(
      dto,
      makeReq('10.0.0.1') as Request,
    );

    expect(result).toEqual({ url: 'https://checkout.stripe.com/pay/managed' });
    expect(
      managedStripeCheckoutService.createCheckoutSession,
    ).toHaveBeenCalledWith(dto);
  });

  it('returns the managed provisioning result', async () => {
    managedStripeCheckoutService.getCheckoutResult.mockResolvedValue({
      apiKey: 'gf_test_123',
      apiKeyAlreadyExists: false,
      brandId: 'brand_1',
      email: 'managed@example.com',
      organizationId: 'org_1',
      userId: 'user_1',
    });

    const result = await controller.getCheckoutResult('cs_123');

    expect(result.apiKey).toBe('gf_test_123');
  });

  it('throws 404 when provisioning result is missing', async () => {
    managedStripeCheckoutService.getCheckoutResult.mockResolvedValue(null);

    await expect(controller.getCheckoutResult('missing')).rejects.toThrow(
      new HttpException(expect.anything(), HttpStatus.NOT_FOUND),
    );
  });
});
