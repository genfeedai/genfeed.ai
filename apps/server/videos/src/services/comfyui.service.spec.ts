import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@videos/config/config.service';
import { ComfyUIService } from '@videos/services/comfyui.service';

// Mock axios
const mockAxiosGet = vi.fn();
const mockAxiosPost = vi.fn();
vi.mock('axios', () => ({
  default: {
    get: (...args: unknown[]) => mockAxiosGet(...args),
    post: (...args: unknown[]) => mockAxiosPost(...args),
  },
}));

describe('ComfyUIService', () => {
  let service: ComfyUIService;
  let configService: { COMFYUI_URL: string };
  let loggerService: {
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  const COMFYUI_URL = 'http://localhost:8188';

  beforeEach(async () => {
    vi.clearAllMocks();

    configService = { COMFYUI_URL };
    loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComfyUIService,
        { provide: ConfigService, useValue: configService },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    service = module.get(ComfyUIService);
  });

  describe('getStatus()', () => {
    it('returns online status when ComfyUI is reachable', async () => {
      mockAxiosGet.mockResolvedValueOnce({ data: { cpu_usage: 0.1 } });

      const result = await service.getStatus();

      expect(result).toEqual({ status: 'online', url: COMFYUI_URL });
      expect(mockAxiosGet).toHaveBeenCalledWith(`${COMFYUI_URL}/system_stats`, {
        timeout: 5000,
      });
    });

    it('returns offline status when ComfyUI is unreachable', async () => {
      mockAxiosGet.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await service.getStatus();

      expect(result).toEqual({ status: 'offline', url: COMFYUI_URL });
      expect(loggerService.warn).toHaveBeenCalled();
    });
  });

  describe('restart()', () => {
    it('returns a restart message', async () => {
      const result = await service.restart();

      expect(result).toEqual({ message: 'ComfyUI restart signal sent' });
      expect(loggerService.log).toHaveBeenCalled();
    });
  });

  describe('queuePrompt()', () => {
    it('returns prompt_id on successful queue', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: { prompt_id: 'abc-123' },
      });

      const result = await service.queuePrompt({ workflow: 'test' });

      expect(result).toBe('abc-123');
      expect(mockAxiosPost).toHaveBeenCalledWith(
        `${COMFYUI_URL}/prompt`,
        { prompt: { workflow: 'test' } },
        { timeout: 10000 },
      );
    });

    it('returns null when queue request fails', async () => {
      mockAxiosPost.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await service.queuePrompt({ workflow: 'test' });

      expect(result).toBeNull();
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('getHistory()', () => {
    it('returns history entry when found', async () => {
      const historyEntry = {
        outputs: { '0': { images: [{ filename: 'output.png' }] } },
        status: { completed: true, status_str: 'success' },
      };
      mockAxiosGet.mockResolvedValueOnce({
        data: { 'prompt-abc': historyEntry },
      });

      const result = await service.getHistory('prompt-abc');

      expect(result).toEqual(historyEntry);
    });

    it('returns null when prompt_id not in history', async () => {
      mockAxiosGet.mockResolvedValueOnce({ data: {} });

      const result = await service.getHistory('unknown-id');

      expect(result).toBeNull();
    });

    it('returns null on network error', async () => {
      mockAxiosGet.mockRejectedValueOnce(new Error('Timeout'));

      const result = await service.getHistory('prompt-id');

      expect(result).toBeNull();
    });
  });

  describe('queueAndWait()', () => {
    it('returns null when queuePrompt fails', async () => {
      mockAxiosPost.mockRejectedValueOnce(new Error('Queue error'));

      const result = await service.queueAndWait({ workflow: 'test' });

      expect(result).toBeNull();
    });

    it('returns filename when generation completes', async () => {
      // First call: queue
      mockAxiosPost.mockResolvedValueOnce({
        data: { prompt_id: 'prompt-xyz' },
      });

      // Second call: history returns completed
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          'prompt-xyz': {
            outputs: {
              '0': { images: [{ filename: 'generated.png' }] },
            },
            status: { completed: true },
          },
        },
      });

      const result = await service.queueAndWait(
        { workflow: 'test' },
        30000,
        1, // 1ms poll interval
      );

      expect(result).toBe('generated.png');
    });

    it('returns null when generation errors', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: { prompt_id: 'prompt-err' },
      });

      mockAxiosGet.mockResolvedValueOnce({
        data: {
          'prompt-err': {
            outputs: {},
            status: { status_str: 'error' },
          },
        },
      });

      const result = await service.queueAndWait({ workflow: 'test' }, 30000, 1);

      expect(result).toBeNull();
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('returns null when completed but no images in outputs', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: { prompt_id: 'prompt-noimg' },
      });

      mockAxiosGet.mockResolvedValueOnce({
        data: {
          'prompt-noimg': {
            outputs: { '0': { images: [] } },
            status: { completed: true },
          },
        },
      });

      const result = await service.queueAndWait({ workflow: 'test' }, 30000, 1);

      expect(result).toBeNull();
    });
  });
});
