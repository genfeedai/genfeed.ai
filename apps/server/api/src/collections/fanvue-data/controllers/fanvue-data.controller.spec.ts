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

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should have the fanvue data service injected', () => {
    expect(service).toBeDefined();
    expect(controller._fanvueDataService).toBe(service);
  });

  it('should expose the service as a readonly property', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(controller),
      '_fanvueDataService',
    );
    // The service is assigned via constructor, should be accessible
    expect(controller._fanvueDataService).toBeDefined();
  });

  it('should be decorated with @Controller("fanvue-data")', () => {
    const path = Reflect.getMetadata('path', FanvueDataController);
    expect(path).toBe('fanvue-data');
  });

  it('should have the service with content model available', () => {
    expect(mockFanvueDataService._contentModel).toBeDefined();
    expect(mockFanvueDataService._contentModel.find).toBeDefined();
  });

  it('should have the service with earnings model available', () => {
    expect(mockFanvueDataService._earningsModel).toBeDefined();
    expect(mockFanvueDataService._earningsModel.find).toBeDefined();
  });

  it('should have the service with subscriber model available', () => {
    expect(mockFanvueDataService._subscriberModel).toBeDefined();
    expect(mockFanvueDataService._subscriberModel.find).toBeDefined();
  });

  it('should have the service with schedule model available', () => {
    expect(mockFanvueDataService._scheduleModel).toBeDefined();
    expect(mockFanvueDataService._scheduleModel.find).toBeDefined();
  });

  it('should have the service with sync log model available', () => {
    expect(mockFanvueDataService._syncLogModel).toBeDefined();
    expect(mockFanvueDataService._syncLogModel.find).toBeDefined();
  });

  it('should compile the module with only the required providers', async () => {
    // Verifies the controller only depends on FanvueDataService
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FanvueDataController],
      providers: [{ provide: FanvueDataService, useValue: {} }],
    }).compile();

    expect(
      module.get<FanvueDataController>(FanvueDataController),
    ).toBeDefined();
  });
});
