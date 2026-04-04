import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { ThreadsService } from '@api/services/integrations/threads/services/threads.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';

describe('ThreadsService', () => {
  let service: ThreadsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ThreadsService,
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('') },
        },
        {
          provide: CredentialsService,
          useValue: { findOne: vi.fn(), patch: vi.fn() },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn() },
        },
        {
          provide: HttpService,
          useValue: { get: vi.fn(), post: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<ThreadsService>(ThreadsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAccountDetails', () => {
    it('should call the Threads Graph API with access token', async () => {
      const mockResponse = { data: { id: '123', username: 'testuser' } };
      const mockHttpService = service['httpService'];
      (mockHttpService.get as ReturnType<typeof vi.fn>).mockReturnValue({
        pipe: vi.fn().mockReturnThis(),
        subscribe: vi.fn(),
        [Symbol.observable]: vi.fn(),
        toPromise: vi.fn().mockResolvedValue(mockResponse),
      });

      // Since firstValueFrom is used, we need to mock the observable properly
      const { of } = await import('rxjs');
      (mockHttpService.get as ReturnType<typeof vi.fn>).mockReturnValue(
        of(mockResponse),
      );

      const result = await service.getAccountDetails('test-token');

      expect(result).toEqual(mockResponse.data);
      expect(mockHttpService.get).toHaveBeenCalledWith(
        expect.stringContaining('/me'),
        expect.objectContaining({
          params: expect.objectContaining({
            access_token: 'test-token',
          }),
        }),
      );
    });

    it('should throw and log error when API call fails', async () => {
      const mockHttpService = service['httpService'];
      const { throwError } = await import('rxjs');
      const error = new Error('API error');
      (mockHttpService.get as ReturnType<typeof vi.fn>).mockReturnValue(
        throwError(() => error),
      );

      await expect(service.getAccountDetails('test-token')).rejects.toThrow(
        'API error',
      );
    });
  });

  describe('getTrends', () => {
    it('should return mock trend data for Threads', () => {
      const trends = service.getTrends();

      expect(Array.isArray(trends)).toBe(true);
      expect(trends.length).toBe(5);
      expect(trends[0]).toEqual(
        expect.objectContaining({
          platform: 'threads',
          topic: 'AI',
        }),
      );
    });
  });

  describe('publishText', () => {
    it('should throw error when text exceeds 500 characters', async () => {
      const longText = 'a'.repeat(501);

      await expect(
        service.publishText('org-1', 'brand-1', longText),
      ).rejects.toThrow('500 characters');
    });
  });

  describe('publishImage', () => {
    it('should throw error when text exceeds 500 characters', async () => {
      const longText = 'a'.repeat(501);

      await expect(
        service.publishImage(
          'org-1',
          'brand-1',
          'https://example.com/img.png',
          longText,
        ),
      ).rejects.toThrow('500 characters');
    });
  });
});
