vi.mock('@api/helpers/decorators/swagger/auto-swagger.decorator', () => ({
  AutoSwagger: () => () => undefined,
}));

import { SkillCheckoutController } from '@api/skills-pro/controllers/skill-checkout.controller';
import { SkillCheckoutService } from '@api/skills-pro/services/skill-checkout.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('SkillCheckoutController', () => {
  let controller: SkillCheckoutController;
  let skillCheckoutService: { createCheckoutSession: ReturnType<typeof vi.fn> };

  const makeReq = (ip: string): Partial<Request> => ({ ip });

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

    vi.clearAllMocks();

    // Reset module-level rate limiter state between tests by re-importing the
    // controller — but since it's in-memory we just call with distinct IPs.
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── createCheckout ─────────────────────────────────────────────────────

  describe('createCheckout', () => {
    it('should call service and return its result', async () => {
      const mockResult = { url: 'https://checkout.stripe.com/pay/cs_test_abc' };
      skillCheckoutService.createCheckoutSession.mockResolvedValue(mockResult);

      const dto = { email: 'user@example.com' };
      const req = makeReq('10.0.0.1');

      const result = await controller.createCheckout(dto, req as Request);

      expect(result).toEqual(mockResult);
      expect(skillCheckoutService.createCheckoutSession).toHaveBeenCalledWith(
        dto,
      );
    });

    it('should pass dto without email to service', async () => {
      skillCheckoutService.createCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.com/pay/x',
      });

      const dto = {};
      await controller.createCheckout(dto, makeReq('10.0.0.2') as Request);

      expect(skillCheckoutService.createCheckoutSession).toHaveBeenCalledWith(
        {},
      );
    });

    it('should use "unknown" as ip key when req.ip is undefined', async () => {
      skillCheckoutService.createCheckoutSession.mockResolvedValue({
        url: 'https://x',
      });

      // ip not set — falls back to 'unknown' key; first call should succeed
      const req = { ip: undefined } as unknown as Request;
      const dto = { email: 'a@b.com' };

      await expect(controller.createCheckout(dto, req)).resolves.toBeDefined();
    });

    it('should propagate service errors', async () => {
      skillCheckoutService.createCheckoutSession.mockRejectedValue(
        new Error('Stripe unavailable'),
      );

      const dto = { email: 'fail@example.com' };

      await expect(
        controller.createCheckout(dto, makeReq('10.0.0.3') as Request),
      ).rejects.toThrow('Stripe unavailable');
    });

    it('should throw 429 after exceeding 5 requests from same IP', async () => {
      skillCheckoutService.createCheckoutSession.mockResolvedValue({
        url: 'https://x',
      });

      const ip = `192.168.1.${Math.floor(Math.random() * 200) + 1}`; // unique IP per test run
      const dto = { email: 'rate@test.com' };
      const req = makeReq(ip) as Request;

      // First 5 calls should succeed
      for (let i = 0; i < 5; i++) {
        await controller.createCheckout(dto, req);
      }

      // 6th call should be rate-limited (throws synchronously)
      expect(() => controller.createCheckout(dto, req)).toThrow(HttpException);

      try {
        controller.createCheckout(dto, req);
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(
          HttpStatus.TOO_MANY_REQUESTS,
        );
        expect((err as HttpException).message).toContain(
          'Too many checkout requests',
        );
      }
    });

    it('should allow requests from different IPs independently', async () => {
      skillCheckoutService.createCheckoutSession.mockResolvedValue({
        url: 'https://x',
      });

      const dto = { email: 'multi@test.com' };

      // Each unique IP has its own quota — these should all succeed
      for (let i = 0; i < 5; i++) {
        const ip = `172.16.${i}.1`;
        await expect(
          controller.createCheckout(dto, makeReq(ip) as Request),
        ).resolves.toBeDefined();
      }
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

      await controller.createCheckout(dto, makeReq('10.5.5.5') as Request);

      expect(skillCheckoutService.createCheckoutSession).toHaveBeenCalledWith(
        dto,
      );
    });

    it('should not call service when rate limit is exceeded', async () => {
      skillCheckoutService.createCheckoutSession.mockResolvedValue({
        url: 'https://x',
      });

      const ip = `10.99.99.${Math.floor(Math.random() * 200) + 1}`;
      const dto = {};
      const req = makeReq(ip) as Request;

      for (let i = 0; i < 5; i++) {
        await controller.createCheckout(dto, req);
      }

      // 6th call — rate limited, service should NOT be called again
      try {
        await controller.createCheckout(dto, req);
      } catch {
        // expected
      }

      expect(skillCheckoutService.createCheckoutSession).toHaveBeenCalledTimes(
        5,
      );
    });
  });
});
