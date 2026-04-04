import { VideosService } from '@api/collections/videos/services/videos.service';
import { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import { MCPController } from '@api/endpoints/mcp/mcp.controller';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { Test, TestingModule } from '@nestjs/testing';

describe('MCPModule', () => {
  let _module: TestingModule;

  beforeEach(async () => {
    _module = await Test.createTestingModule({
      controllers: [MCPController],
      providers: [
        {
          provide: VideosService,
          useValue: {
            create: vi.fn(),
          },
        },
        {
          provide: AnalyticsService,
          useValue: {
            findAll: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(ClerkGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SubscriptionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CreditsGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModelsGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({ intercept: (_ctx, next) => next.handle() })
      .compile();
  });

  afterEach(async () => {
    if (_module) {
      await _module.close();
    }
  });

  it('should be defined', () => {
    expect(_module).toBeDefined();
  });

  it('should provide MCPController', () => {
    const mcpController = _module.get<MCPController>(MCPController);
    expect(mcpController).toBeDefined();
  });

  it('should provide VideosService', () => {
    const service = _module.get<VideosService>(VideosService);
    expect(service).toBeDefined();
  });

  it('should provide AnalyticsService', () => {
    const service = _module.get<AnalyticsService>(AnalyticsService);
    expect(service).toBeDefined();
  });
});
