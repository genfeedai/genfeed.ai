import { ElementsBlacklistsController } from '@api/collections/elements/blacklists/controllers/blacklists.controller';
import { ElementsBlacklistsService } from '@api/collections/elements/blacklists/services/blacklists.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('ElementsBlacklistsController', () => {
  let controller: ElementsBlacklistsController;
  let service: ElementsBlacklistsService;

  const mockElementsBlacklistsService = {
    create: vi.fn(),
    delete: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ElementsBlacklistsController],
      providers: [
        {
          provide: ElementsBlacklistsService,
          useValue: mockElementsBlacklistsService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ElementsBlacklistsController>(
      ElementsBlacklistsController,
    );
    service = module.get<ElementsBlacklistsService>(ElementsBlacklistsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should have blacklistsService injected', () => {
    expect(controller.blacklistsService).toBeDefined();
    expect(controller.blacklistsService).toBe(service);
  });

  it('should have loggerService injected', () => {
    expect(controller.loggerService).toBeDefined();
  });
});
