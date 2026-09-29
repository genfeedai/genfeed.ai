import { FanvueDataController } from '@api/collections/fanvue-data/controllers/fanvue-data.controller';
import { FanvueDataService } from '@api/collections/fanvue-data/services/fanvue-data.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { Test, type TestingModule } from '@nestjs/testing';

describe('FanvueDataController', () => {
  let controller: FanvueDataController;
  let service: FanvueDataService;

  const mockFanvueDataService = {
    _contentModel: { create: vi.fn(), find: vi.fn(), findOne: vi.fn() },
    _earningsModel: { create: vi.fn(), find: vi.fn(), findOne: vi.fn() },
    _logger: { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    _scheduleModel: { create: vi.fn(), find: vi.fn(), findOne: vi.fn() },
    _subscriberModel: { create: vi.fn(), find: vi.fn(), findOne: vi.fn() },
    _syncLogModel: { create: vi.fn(), find: vi.fn(), findOne: vi.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FanvueDataController],
      providers: [
        { provide: FanvueDataService, useValue: mockFanvueDataService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<FanvueDataController>(FanvueDataController);
    service = module.get<FanvueDataService>(FanvueDataService);
  });

  it('should have the fanvue data service injected', () => {
    expect(service).toBeDefined();
    expect(controller._fanvueDataService).toBe(service);
  });
});
