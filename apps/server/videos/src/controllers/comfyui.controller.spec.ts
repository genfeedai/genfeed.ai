import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@videos/config/config.service';
import { ComfyUIController } from '@videos/controllers/comfyui.controller';
import { ComfyUIService } from '@videos/services/comfyui.service';

describe('ComfyUIController (videos)', () => {
  let controller: ComfyUIController;
  let comfyuiService: {
    getStatus: ReturnType<typeof vi.fn>;
    restart: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ComfyUIController],
      providers: [
        {
          provide: ComfyUIService,
          useValue: {
            getStatus: vi
              .fn()
              .mockResolvedValue({ running: true, url: 'http://comfyui:8188' }),
            restart: vi.fn().mockResolvedValue({ restarted: true }),
          },
        },
        {
          provide: ConfigService,
          useValue: { API_KEY: 'test-api-key', isDevelopment: false },
        },
        { provide: LoggerService, useValue: { warn: vi.fn() } },
      ],
    }).compile();

    controller = module.get(ComfyUIController);
    comfyuiService = module.get(ComfyUIService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getStatus', () => {
    it('delegates to ComfyUIService.getStatus', async () => {
      const result = await controller.getStatus();
      expect(comfyuiService.getStatus).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ running: true, url: 'http://comfyui:8188' });
    });

    it('returns status as-is from service', async () => {
      comfyuiService.getStatus.mockResolvedValue({
        error: 'Stopped',
        running: false,
      });
      const result = await controller.getStatus();
      expect(result).toEqual({ error: 'Stopped', running: false });
    });

    it('propagates service errors', async () => {
      comfyuiService.getStatus.mockRejectedValue(
        new Error('Connection refused'),
      );
      await expect(controller.getStatus()).rejects.toThrow(
        'Connection refused',
      );
    });
  });

  describe('restart', () => {
    it('delegates to ComfyUIService.restart', async () => {
      const result = await controller.restart();
      expect(comfyuiService.restart).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ restarted: true });
    });

    it('propagates errors from the service', async () => {
      comfyuiService.restart.mockRejectedValue(new Error('Docker unavailable'));
      await expect(controller.restart()).rejects.toThrow('Docker unavailable');
    });

    it('does not call getStatus when restart is invoked', async () => {
      await controller.restart();
      expect(comfyuiService.getStatus).not.toHaveBeenCalled();
    });

    it('does not call restart when getStatus is invoked', async () => {
      await controller.getStatus();
      expect(comfyuiService.restart).not.toHaveBeenCalled();
    });
  });
});
