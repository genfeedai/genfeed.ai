import { ComfyUIController } from '@images/controllers/comfyui.controller';
import { ComfyUIService } from '@images/services/comfyui.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('ComfyUIController (images)', () => {
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
            getStatus: vi.fn().mockResolvedValue({
              running: true,
              url: 'http://localhost:8188',
            }),
            restart: vi.fn().mockResolvedValue({ restarted: true }),
          },
        },
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
      expect(result).toEqual({ running: true, url: 'http://localhost:8188' });
    });

    it('returns whatever the service returns', async () => {
      comfyuiService.getStatus.mockResolvedValue({
        error: 'Container stopped',
        running: false,
      });
      const result = await controller.getStatus();
      expect(result).toEqual({ error: 'Container stopped', running: false });
    });
  });

  describe('restart', () => {
    it('delegates to ComfyUIService.restart', async () => {
      const result = await controller.restart();
      expect(comfyuiService.restart).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ restarted: true });
    });

    it('propagates errors from the service', async () => {
      comfyuiService.restart.mockRejectedValue(
        new Error('Docker not available'),
      );
      await expect(controller.restart()).rejects.toThrow(
        'Docker not available',
      );
    });

    it('calls restart independently of getStatus', async () => {
      await controller.getStatus();
      await controller.restart();
      expect(comfyuiService.getStatus).toHaveBeenCalledTimes(1);
      expect(comfyuiService.restart).toHaveBeenCalledTimes(1);
    });
  });
});
