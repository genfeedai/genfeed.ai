import { ConfigService } from '@api/config/config.service';
import { LeonardoAIService } from '@api/services/integrations/leonardoai/leonardoai.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

// Mock the sdk instance that apiFactory returns
const mockSdkInstance = {
  auth: vi.fn(),
  createGeneration: vi.fn(),
  createImageToVideoGeneration: vi.fn(),
  createReworkGeneration: vi.fn(),
  createVideoGeneration: vi.fn(),
};

// Mock the 'api' module so that apiFactory('@leonardoai/...') returns mockSdkInstance.
// This is hoisted before imports so it intercepts the ESM import in the service.
vi.mock('api', () => ({
  default: vi.fn(() => mockSdkInstance),
}));

describe('LeonardoAIService', () => {
  let service: LeonardoAIService;

  const configMock = {
    get: vi.fn(() => 'test'),
  } as unknown as ConfigService;

  const loggerMock = {
    error: vi.fn(),
    log: vi.fn(),
  } as unknown as LoggerService;

  beforeEach(async () => {
    // Reset mocks before each test so clearAllMocks from setup doesn't break us
    mockSdkInstance.auth.mockReturnValue(undefined);
    mockSdkInstance.createGeneration.mockResolvedValue({
      data: { sdGenerationJob: { generationId: '123' } },
      status: 200,
    });
    mockSdkInstance.createVideoGeneration.mockResolvedValue({
      data: { sdGenerationJob: { generationId: '456' } },
      status: 200,
    });
    mockSdkInstance.createImageToVideoGeneration.mockResolvedValue({
      data: { sdGenerationJob: { generationId: '789' } },
      status: 200,
    });
    mockSdkInstance.createReworkGeneration.mockResolvedValue({
      data: { sdGenerationJob: { generationId: '321' } },
      status: 200,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeonardoAIService,
        { provide: ConfigService, useValue: configMock },
        { provide: LoggerService, useValue: loggerMock },
      ],
    }).compile();

    service = module.get<LeonardoAIService>(LeonardoAIService);

    // Override the sdk instance on the service with our mock so all calls go to mockSdkInstance
    Object.assign(service, { sdk: mockSdkInstance });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('generates an image', async () => {
    const res = await service.generateImage('prompt', {
      height: 1024,
      style: 'anime',
      width: 1024,
    });

    expect(res).toBe('123');
    expect(mockSdkInstance.createGeneration).toHaveBeenCalled();
  });

  it('generates a video from text', async () => {
    const res = await service.generateTextToVideo('prompt');

    expect(res).toBe('456');
    expect(mockSdkInstance.createVideoGeneration).toHaveBeenCalled();
  });

  it('generates a video from an image', async () => {
    const res = await service.generateImageToVideo('prompt', 'img123');

    expect(res).toBe('789');
    expect(mockSdkInstance.createImageToVideoGeneration).toHaveBeenCalledWith({
      imageId: 'img123',
      imageType: 'GENERATED',
      prompt: 'prompt',
    });
  });

  it('reworks an image', async () => {
    const res = await service.reworkImage('prompt', 'img321');

    expect(res).toBe('321');
    expect(mockSdkInstance.createReworkGeneration).toHaveBeenCalledWith({
      imageId: 'img321',
      prompt: 'prompt',
    });
  });
});
