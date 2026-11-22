vi.mock('@api/helpers/decorators/swagger/auto-swagger.decorator', () => ({
  AutoSwagger: () => () => undefined,
}));

import {
  RATE_LIMIT_KEY,
  type RateLimitOptions,
} from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { SkillCheckoutController } from '@api/skills-pro/controllers/skill-checkout.controller';
import { SkillCheckoutService } from '@api/skills-pro/services/skill-checkout.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('SkillCheckoutController', () => {
  let controller: SkillCheckoutController;
  let skillCheckoutService: { createCheckoutSession: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    skillCheckoutService = {
      createCheckoutSession: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SkillCheckoutController],
      providers: [
        {
          provide: SkillCheckoutService,
          useValue: skillCheckoutService,
        },
      ],
    }).compile();

    controller = module.get<SkillCheckoutController>(SkillCheckoutController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createCheckout', () => {
    it('should call service and return its result', async () => {
      const mockResult = { url: 'https://checkout.stripe.com/pay/cs_test_abc' };
      skillCheckoutService.createCheckoutSession.mockResolvedValue(mockResult);

      const dto = { email: 'user@example.com' };

      await expect(controller.createCheckout(dto)).resolves.toEqual(mockResult);
      expect(skillCheckoutService.createCheckoutSession).toHaveBeenCalledWith(
        dto,
      );
    });

    it('should pass dto without email to service', async () => {
      skillCheckoutService.createCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.com/pay/x',
      });

      await controller.createCheckout({});

      expect(skillCheckoutService.createCheckoutSession).toHaveBeenCalledWith(
        {},
      );
    });

    it('should propagate service errors', async () => {
      skillCheckoutService.createCheckoutSession.mockRejectedValue(
        new Error('Stripe unavailable'),
      );

      await expect(
        controller.createCheckout({ email: 'fail@example.com' }),
      ).rejects.toThrow('Stripe unavailable');
    });

    it('should include successUrl and cancelUrl in dto if provided', async () => {
      skillCheckoutService.createCheckoutSession.mockResolvedValue({
        url: 'https://x',
      });

      const dto = {
        cancelUrl: 'https://example.com/cancel',
        email: 'x@x.com',
        successUrl: 'https://example.com/success',
      };

      await controller.createCheckout(dto);

      expect(skillCheckoutService.createCheckoutSession).toHaveBeenCalledWith(
        dto,
      );
    });

    it('is limited to 5 requests a minute per IP by the shared rate limit guard', () => {
      const options = Reflect.getMetadata(
        RATE_LIMIT_KEY,
        SkillCheckoutController.prototype.createCheckout,
      ) as RateLimitOptions;

      expect(options).toEqual({ limit: 5, scope: 'ip', windowMs: 60_000 });
    });
  });
});
