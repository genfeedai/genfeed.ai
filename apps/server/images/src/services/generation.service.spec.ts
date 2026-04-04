import { ConfigService } from '@images/config/config.service';
import type {
  GenerateImageRequest,
  GeneratePulidRequest,
} from '@images/interfaces/images.interfaces';
import { JobService } from '@images/services/job.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { GenerationService } from './generation.service';

vi.mock('@images/config/config.service');
vi.mock('@images/services/job.service');
vi.mock('@libs/logger/logger.service');

describe('GenerationService', () => {
  let service: GenerationService;
  let logger: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GenerationService,
        {
          provide: ConfigService,
          useValue: {
            COMFYUI_URL: 'http://localhost:8188',
          },
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: JobService,
          useValue: {
            createJob: vi.fn(),
            getJob: vi.fn(),
            updateJob: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(GenerationService);
    logger = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateImage()', () => {
    const imageRequest: GenerateImageRequest = {
      height: 1024,
      model: 'sd_xl',
      prompt: 'a beautiful sunset over the mountains',
      width: 1024,
    };

    it('throws an error indicating ComfyUI is not wired', async () => {
      await expect(service.generateImage(imageRequest)).rejects.toThrow(
        'Image generation is not available',
      );
    });

    it('error message mentions ComfyUI WebSocket API', async () => {
      await expect(service.generateImage(imageRequest)).rejects.toThrow(
        'ComfyUI WebSocket API',
      );
    });

    it('error message explains orphan job concern', async () => {
      await expect(service.generateImage(imageRequest)).rejects.toThrow(
        'Cannot create orphan jobs',
      );
    });

    it('logs the request before throwing', async () => {
      await expect(service.generateImage(imageRequest)).rejects.toThrow();
      expect(logger.log).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ prompt: imageRequest.prompt }),
      );
    });

    it('throws even with minimal request (prompt only)', async () => {
      await expect(service.generateImage({ prompt: 'test' })).rejects.toThrow(
        'Image generation is not available',
      );
    });
  });

  describe('generatePulid()', () => {
    const pulidRequest: GeneratePulidRequest = {
      model: 'pulid_v1',
      prompt: 'a professional headshot',
      referenceImageUrl: 'https://example.com/face.jpg',
    };

    it('throws an error indicating PuLID is not wired', async () => {
      await expect(service.generatePulid(pulidRequest)).rejects.toThrow(
        'PuLID generation is not available',
      );
    });

    it('error message mentions ComfyUI WebSocket API', async () => {
      await expect(service.generatePulid(pulidRequest)).rejects.toThrow(
        'ComfyUI WebSocket API',
      );
    });

    it('error message explains orphan job concern', async () => {
      await expect(service.generatePulid(pulidRequest)).rejects.toThrow(
        'Cannot create orphan jobs',
      );
    });

    it('logs the request before throwing', async () => {
      await expect(service.generatePulid(pulidRequest)).rejects.toThrow();
      expect(logger.log).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ prompt: pulidRequest.prompt }),
      );
    });

    it('throws with minimal request', async () => {
      await expect(
        service.generatePulid({
          prompt: 'test',
          referenceImageUrl: 'http://img.jpg',
        }),
      ).rejects.toThrow('PuLID generation is not available');
    });
  });
});
