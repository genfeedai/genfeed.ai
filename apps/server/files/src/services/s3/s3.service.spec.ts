import { ConfigService } from '@files/config/config.service';
import { S3Service } from '@files/services/s3/s3.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

// Mock AWS SDK
vi.mock('@aws-sdk/client-s3', () => ({
  DeleteObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
  HeadObjectCommand: vi.fn(),
  PutObjectCommand: vi.fn(),
  S3Client: vi.fn(() => ({
    send: vi.fn(),
  })),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}));

describe('S3Service', () => {
  let service: S3Service;
  let configService: ConfigService;

  const mockConfigService = {
    get: vi.fn((key: string) => {
      const config = {
        AWS_ACCESS_KEY_ID: 'test-access-key',
        AWS_REGION: 'us-west-1',
        AWS_S3_BUCKET: 'test-bucket',
        AWS_SECRET_ACCESS_KEY: 'test-secret-key',
      };
      return config[key];
    }),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        S3Service,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<S3Service>(S3Service);
    configService = module.get<ConfigService>(ConfigService);
    module.get<LoggerService>(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize S3 client with correct configuration', () => {
    expect(configService.get).toHaveBeenCalledWith('AWS_REGION');
    expect(configService.get).toHaveBeenCalledWith('AWS_ACCESS_KEY_ID');
    expect(configService.get).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY');
  });
});
