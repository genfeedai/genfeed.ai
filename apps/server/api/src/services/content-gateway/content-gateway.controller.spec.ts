import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ContentGatewayController } from '@api/services/content-gateway/content-gateway.controller';
import { ContentGatewayService } from '@api/services/content-gateway/content-gateway.service';
import { testId } from '@helpers/testing/test-id.helper';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

const organizationId = testId('org');
const userId = testId('user');

describe('ContentGatewayController', () => {
  let controller: ContentGatewayController;
  let contentGatewayService: {
    processManualRequest: ReturnType<typeof vi.fn>;
    routeSignal: ReturnType<typeof vi.fn>;
  };

  const mockUser: User = {
    id: 'user_123',
    organizationId,
    userId,
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
              .mockResolvedValue({ executions: ['execution-2'], posts: [] }),
            routeSignal: vi
              .fn()
              .mockResolvedValue({ executions: ['execution-1'], posts: [] }),
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
        organizationId: organizationId,
        type: 'cron',
      }),
    );
    expect(result.executions).toEqual(['execution-1']);
  });

  it('executes a manual skill', async () => {
    await controller.executeSkill(mockRequest, mockUser, {
      brandId: 'brand-1',
      params: { prompt: 'x' },
      skillSlug: 'content-writing',
    });

    expect(contentGatewayService.processManualRequest).toHaveBeenCalledWith(
      organizationId,
      'brand-1',
      'content-writing',
      { prompt: 'x' },
      userId,
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
        organizationId: organizationId,
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
      organizationId,
      'brand-5',
      'video-gen',
      params,
      userId,
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
      executions: ['execution-1'],
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
