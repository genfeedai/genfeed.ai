import { ModelsService } from '@api/collections/models/services/models.service';
import { SchedulesService } from '@api/collections/schedules/services/schedules.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CredentialPlatform, TargetValidationState } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

// Mock OpenAI
vi.mock('openai', () => {
  return {
    __esModule: true,
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
    })),
  };
});

describe('SchedulesService', () => {
  let service: SchedulesService;

  const mockPrismaService = {
    schedule: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(null),
    },
    repurposingJob: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(null),
    },
  };

  const mockConfigService = {
    get: vi.fn().mockReturnValue('test-api-key'),
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
        SchedulesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: ModelsService,
          useValue: {
            getOneByKey: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: ReplicateService,
          useValue: {
            runTraining: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SchedulesService>(SchedulesService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('channel capabilities', () => {
    it('should expose supported scheduler channels', () => {
      expect(
        service
          .listChannelCapabilities()
          .map((capability) => capability.platform),
      ).toEqual([
        CredentialPlatform.YOUTUBE,
        CredentialPlatform.TIKTOK,
        CredentialPlatform.INSTAGRAM,
        CredentialPlatform.TWITTER,
        CredentialPlatform.LINKEDIN,
      ]);
    });

    it('should expose hidden channel stubs when requested', () => {
      expect(
        service
          .listChannelCapabilities({ includeHidden: true })
          .map((capability) => capability.platform),
      ).toContain(CredentialPlatform.REDDIT);
    });

    it('should resolve a single channel capability', () => {
      expect(service.getChannelCapability(CredentialPlatform.YOUTUBE)).toEqual(
        expect.objectContaining({
          label: 'YouTube',
          platform: CredentialPlatform.YOUTUBE,
        }),
      );
    });

    it('should validate channel target settings through the shared contract', () => {
      const result = service.validateChannelTargetSettings({
        media: [{ id: 'asset_1', kind: 'video' }],
        platform: CredentialPlatform.YOUTUBE,
        settings: {},
      });

      expect(result.validationState).toBe(TargetValidationState.INVALID);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'channel_target.required_setting',
            field: 'settings.privacyStatus',
          }),
        ]),
      );
    });
  });
});
