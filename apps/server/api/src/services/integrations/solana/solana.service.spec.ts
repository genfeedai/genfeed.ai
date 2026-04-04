import { ConfigService } from '@api/config/config.service';
import { SolanaService } from '@api/services/integrations/solana/solana.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';

describe('SolanaService', () => {
  let service: SolanaService;
  let mockHttpService: { get: ReturnType<typeof vi.fn> };

  const configMock = {
    get: vi.fn(() => 'test'),
  } as unknown as ConfigService;

  const loggerMock = {
    error: vi.fn(),
    log: vi.fn(),
  } as unknown as LoggerService;

  beforeEach(async () => {
    mockHttpService = {
      get: vi.fn().mockReturnValue(
        of({
          data: { image: 'img', isNft: true, name: 'name' },
          status: 200,
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SolanaService,
        { provide: ConfigService, useValue: configMock },
        { provide: LoggerService, useValue: loggerMock },
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<SolanaService>(SolanaService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('gets nft data', async () => {
    const res = await service.getNft('addr');

    expect(res).toEqual({ image: 'img', name: 'name' });
    expect(mockHttpService.get).toHaveBeenCalled();
  });

  it('throws when address is not an NFT', async () => {
    mockHttpService.get.mockReturnValue(
      of({
        data: { image: 'img', isNft: false },
        status: 200,
      }),
    );

    await expect(service.getNft('non-nft-addr')).rejects.toThrow(
      'Address is not an NFT',
    );
  });

  it('throws when NFT image not found', async () => {
    mockHttpService.get.mockReturnValue(
      of({
        data: { image: '', isNft: true },
        status: 200,
      }),
    );

    await expect(service.getNft('no-image')).rejects.toThrow(
      'NFT image not found',
    );
  });

  it('throws when status is non-200', async () => {
    mockHttpService.get.mockReturnValue(
      of({
        data: {},
        status: 500,
      }),
    );

    await expect(service.getNft('server-err')).rejects.toThrow('non-200');
  });

  it('sends Authorization header with API key', async () => {
    await service.getNft('addr');

    expect(mockHttpService.get).toHaveBeenCalledWith(
      expect.stringContaining('/nft/addr'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer test' },
      }),
    );
  });
});
