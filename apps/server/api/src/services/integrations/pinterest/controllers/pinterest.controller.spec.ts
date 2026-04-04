import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { PinterestController } from '@api/services/integrations/pinterest/controllers/pinterest.controller';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('PinterestController', () => {
  let controller: PinterestController;
  const serviceMock = {
    createPin: vi.fn(),
    exchangeCodeForToken: vi.fn(),
    generateAuthUrl: vi.fn().mockReturnValue('url'),
    getPinAnalytics: vi.fn(),
    searchPins: vi.fn(),
  } as PinterestService;
  const loggerMock = { log: vi.fn() } as LoggerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PinterestController],
      providers: [
        { provide: PinterestService, useValue: serviceMock },
        { provide: LoggerService, useValue: loggerMock },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PinterestController>(PinterestController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns auth url', () => {
    const result = controller.getAuthUrl('state');
    expect(serviceMock.generateAuthUrl).toHaveBeenCalledWith('state');
    expect(result).toEqual({ data: { url: 'url' } });
  });

  it('creates pin via service', async () => {
    (serviceMock.createPin as vi.Mock).mockResolvedValue('1');
    const res = await controller.createPin({
      accessToken: 'token',
      boardId: 'board',
      imageUrl: 'img',
      title: 't',
    });
    expect(serviceMock.createPin).toHaveBeenCalled();
    expect(res).toEqual({ data: { id: '1' } });
  });
});
