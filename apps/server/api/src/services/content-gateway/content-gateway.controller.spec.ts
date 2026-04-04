import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ContentGatewayController } from '@api/services/content-gateway/content-gateway.controller';
import { ContentGatewayService } from '@api/services/content-gateway/content-gateway.service';
import type { User } from '@clerk/backend';
import { Test, TestingModule } from '@nestjs/testing';

describe('ContentGatewayController', () => {
  let controller: ContentGatewayController;
  let contentGatewayService: {
    processManualRequest: ReturnType<typeof vi.fn>;
    routeSignal: ReturnType<typeof vi.fn>;
  };

  const mockUser: User = {
    id: 'user_123',
    publicMetadata: {
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContentGatewayController],
      providers: [
        {
          provide: ContentGatewayService,
          useValue: {
            processManualRequest: vi
              .fn()
              .mockResolvedValue({ drafts: [], runs: ['run-2'] }),
            routeSignal: vi
              .fn()
              .mockResolvedValue({ drafts: [], runs: ['run-1'] }),
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
    const result = await controller.routeSignal(mockUser, {
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
    await controller.executeSkill(mockUser, {
      brandId: 'brand-1',
      params: { prompt: 'x' },
      skillSlug: 'content-writing',
    });

    expect(contentGatewayService.processManualRequest).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439012',
      'brand-1',
      'content-writing',
      { prompt: 'x' },
    );
  });

  it('uses organization from user metadata if dto omits organizationId', async () => {
    await controller.routeSignal(mockUser, {
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

  it('prefers dto.organizationId over user metadata when provided', async () => {
    const customOrgId = '507f1f77bcf86cd799439099';
    await controller.routeSignal(mockUser, {
      brandId: 'brand-3',
      organizationId: customOrgId,
      payload: {},
      type: 'webhook',
    });

    expect(contentGatewayService.routeSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: customOrgId,
      }),
    );
  });

  it('passes payload through to service.routeSignal', async () => {
    const payload = { skillSlugs: ['video-gen', 'thumbnail'] };
    await controller.routeSignal(mockUser, {
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
    await controller.executeSkill(mockUser, {
      brandId: 'brand-5',
      params,
      skillSlug: 'video-gen',
    });

    expect(contentGatewayService.processManualRequest).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439012',
      'brand-5',
      'video-gen',
      params,
    );
  });
});
