import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ContentGatewayController } from '@api/services/content-gateway/content-gateway.controller';
import { ContentGatewayService } from '@api/services/content-gateway/content-gateway.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('ContentGatewayController', () => {
  let controller: ContentGatewayController;
  let contentGatewayService: {
    processManualRequest: ReturnType<typeof vi.fn>;
    routeSignal: ReturnType<typeof vi.fn>;
  };

  const mockUser: User = {
    id: 'user_123',
    organizationId: '507f1f77bcf86cd799439012',
    userId: '507f1f77bcf86cd799439011',
  } as unknown as User;
  const mockRequest = {
    originalUrl: '/content-gateway/signal',
  } as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContentGatewayController],
      providers: [
        {
          provide: ContentGatewayService,
          useValue: {
            processManualRequest: vi
              .fn()
              .mockResolvedValue({ posts: [], runs: ['run-2'] }),
            routeSignal: vi
              .fn()
              .mockResolvedValue({ posts: [], runs: ['run-1'] }),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ContentGatewayController);
    contentGatewayService = module.get(ContentGatewayService);
  });

  it('routes a signal', async () => {
    const result = await controller.routeSignal(mockRequest, mockUser, {
      brandId: 'brand-1',
      payload: {},
      type: 'cron',
    });

    expect(contentGatewayService.routeSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        organizationId: '507f1f77bcf86cd799439012',
        type: 'cron',
      }),
    );
    expect(result.runs).toEqual(['run-1']);
  });

  it('executes a manual skill', async () => {
    await controller.executeSkill(mockRequest, mockUser, {
      brandId: 'brand-1',
      params: { prompt: 'x' },
      skillSlug: 'content-writing',
    });

    expect(contentGatewayService.processManualRequest).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439012',
      'brand-1',
      'content-writing',
      { prompt: 'x' },
      '507f1f77bcf86cd799439011',
    );
  });

  it('uses organization from authenticated user metadata', async () => {
    await controller.routeSignal(mockRequest, mockUser, {
      brandId: 'brand-2',
      payload: {},
      type: 'manual',
    });

    expect(contentGatewayService.routeSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: '507f1f77bcf86cd799439012',
      }),
    );
  });

  it('passes payload through to service.routeSignal', async () => {
    const payload = { skillSlugs: ['video-gen', 'thumbnail'] };
    await controller.routeSignal(mockRequest, mockUser, {
      brandId: 'brand-1',
      payload,
      type: 'cron',
    });

    expect(contentGatewayService.routeSignal).toHaveBeenCalledWith(
      expect.objectContaining({ payload }),
    );
  });

  it('passes params through to processManualRequest', async () => {
    const params = { format: 'reel', tone: 'casual' };
    await controller.executeSkill(mockRequest, mockUser, {
      brandId: 'brand-5',
      params,
      skillSlug: 'video-gen',
    });

    expect(contentGatewayService.processManualRequest).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439012',
      'brand-5',
      'video-gen',
      params,
      '507f1f77bcf86cd799439011',
    );
  });

  it('serializes posts before returning the gateway response', async () => {
    contentGatewayService.routeSignal.mockResolvedValueOnce({
      posts: [
        {
          description: 'Safe response',
          id: 'post-1',
          targetSettings: { internal: true },
        },
      ],
      runs: ['run-1'],
    });

    const result = await controller.routeSignal(mockRequest, mockUser, {
      brandId: 'brand-1',
      payload: {},
      type: 'manual',
    });

    expect(result.posts.data[0]).toMatchObject({
      attributes: { description: 'Safe response' },
      id: 'post-1',
      type: 'post',
    });
    expect(result.posts.data[0]).not.toMatchObject({
      attributes: { targetSettings: expect.anything() },
    });
  });
});
