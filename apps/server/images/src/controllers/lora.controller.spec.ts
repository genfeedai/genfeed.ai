import { LoraController } from '@images/controllers/lora.controller';
import type {
  LoraListResult,
  LoraUploadRequest,
  LoraUploadResult,
} from '@images/interfaces/lora.interfaces';
import { LoraService } from '@images/services/lora.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('LoraController', () => {
  let controller: LoraController;

  const mockLoraService = {
    listLoras: vi.fn(),
    uploadLora: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LoraController],
      providers: [
        {
          provide: LoraService,
          useValue: mockLoraService,
        },
      ],
    }).compile();

    controller = module.get<LoraController>(LoraController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('uploadLora', () => {
    it('should delegate to LoraService.uploadLora', async () => {
      const body: LoraUploadRequest = {
        localPath: '/models/my-lora.safetensors',
        loraName: 'my-lora',
      };

      const result: LoraUploadResult = {
        loraName: 'my-lora',
        s3Key: 'trainings/loras/my-lora.safetensors',
        uploaded: true,
      };

      mockLoraService.uploadLora.mockResolvedValue(result);

      const response = await controller.uploadLora(body);

      expect(mockLoraService.uploadLora).toHaveBeenCalledWith(body);
      expect(response).toEqual(result);
    });

    it('should forward the exact body to the service', async () => {
      const body: LoraUploadRequest = {
        localPath: '/some/path/lora-v2.safetensors',
        loraName: 'lora-v2',
      };

      mockLoraService.uploadLora.mockResolvedValue({
        loraName: 'lora-v2',
        s3Key: 'trainings/loras/lora-v2.safetensors',
        uploaded: true,
      });

      await controller.uploadLora(body);

      expect(mockLoraService.uploadLora).toHaveBeenCalledWith({
        localPath: '/some/path/lora-v2.safetensors',
        loraName: 'lora-v2',
      });
    });

    it('should propagate service errors', async () => {
      const body: LoraUploadRequest = {
        localPath: '/bad/path',
        loraName: 'bad-lora',
      };

      mockLoraService.uploadLora.mockRejectedValue(new Error('File not found'));

      await expect(controller.uploadLora(body)).rejects.toThrow(
        'File not found',
      );
    });
  });

  describe('listLoras', () => {
    it('should delegate to LoraService.listLoras', async () => {
      const result: LoraListResult = {
        loras: [
          {
            filename: 'lora-a.safetensors',
            name: 'lora-a',
            source: 'local',
          },
        ],
        total: 1,
      };

      mockLoraService.listLoras.mockResolvedValue(result);

      const response = await controller.listLoras();

      expect(mockLoraService.listLoras).toHaveBeenCalledOnce();
      expect(response).toEqual(result);
    });

    it('should return empty list when no LoRAs exist', async () => {
      const result: LoraListResult = { loras: [], total: 0 };
      mockLoraService.listLoras.mockResolvedValue(result);

      const response = await controller.listLoras();

      expect(response).toEqual({ loras: [], total: 0 });
    });

    it('should return combined local and S3 LoRAs', async () => {
      const result: LoraListResult = {
        loras: [
          {
            filename: 'local.safetensors',
            name: 'local-lora',
            source: 'local',
          },
          {
            filename: 's3-lora.safetensors',
            name: 's3-lora',
            s3Key: 'trainings/loras/s3-lora.safetensors',
            source: 's3',
          },
        ],
        total: 2,
      };

      mockLoraService.listLoras.mockResolvedValue(result);

      const response = await controller.listLoras();

      expect(response.total).toBe(2);
      expect(response.loras).toHaveLength(2);
    });

    it('should propagate service errors', async () => {
      mockLoraService.listLoras.mockRejectedValue(new Error('S3 unavailable'));

      await expect(controller.listLoras()).rejects.toThrow('S3 unavailable');
    });
  });
});
