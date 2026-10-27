import { SchedulesService } from '@api/collections/schedules/services/schedules.service';
import { ValidationException } from '@api/exceptions/validation.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CredentialPlatform,
  TargetValidationState,
} from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

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
    contentPerformance: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    post: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    schedule: {
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
        CredentialPlatform.BEEHIIV,
        CredentialPlatform.GHOST,
        CredentialPlatform.WORDPRESS,
        CredentialPlatform.MEDIUM,
        CredentialPlatform.DEV_TO,
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

  describe('getOptimalTime', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const NOW = Date.parse('2026-10-20T00:00:00Z');
    const FIRST_MONDAY = Date.parse('2026-08-03T13:30:00Z');
    const FIRST_THURSDAY = Date.parse('2026-07-30T18:00:00Z');

    function weekly(prefix: string, firstMs: number, weeks: number) {
      return Array.from({ length: weeks }, (_, index) => ({
        id: `${prefix}-${index}`,
        publishedAt: new Date(firstMs + index * 7 * DAY),
      }));
    }

    function measured(
      posts: { id: string; publishedAt: Date }[],
      engagementRate: number,
    ) {
      return posts.map((post) => ({
        engagementRate,
        measuredAt: new Date(post.publishedAt.getTime() + 36 * 60 * 60 * 1000),
        postId: post.id,
      }));
    }

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns labelled default times when there is no data', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([]);

      const result = await service.getOptimalTime(
        { platform: 'Twitter' },
        'org_1',
      );

      expect(result).toMatchObject({
        basis: 'default',
        eligibleCount: 0,
        method: 'platform-default',
        platform: 'twitter',
        timezone: 'UTC',
      });
      expect(result.windows[0]).toEqual({
        endHour: 10,
        median: null,
        sampleCount: null,
        startHour: 8,
        weekday: null,
      });
      expect(
        mockPrismaService.contentPerformance.findMany,
      ).not.toHaveBeenCalled();
    });

    it("ranks the organization's slots by median engagement rate", async () => {
      const mondays = weekly('mon', FIRST_MONDAY, 12);
      const thursdays = weekly('thu', FIRST_THURSDAY, 12);
      mockPrismaService.post.findMany.mockResolvedValue([
        ...mondays,
        ...thursdays,
      ]);
      mockPrismaService.contentPerformance.findMany.mockResolvedValue([
        ...measured(mondays, 0.05),
        ...measured(thursdays, 0.02),
      ]);

      const result = await service.getOptimalTime(
        { platform: 'twitter' },
        'org_1',
      );

      expect(result.basis).toBe('learned');
      expect(result.method).toBe('median-by-slot');
      expect(result.eligibleCount).toBe(24);
      expect(result.windows).toEqual([
        {
          endHour: 15,
          median: 0.05,
          sampleCount: 12,
          startHour: 12,
          weekday: 0,
        },
        {
          endHour: 21,
          median: 0.02,
          sampleCount: 12,
          startHour: 18,
          weekday: 3,
        },
      ]);
    });

    it('does not rank posts that have no engagement rate', async () => {
      const mondays = weekly('mon', FIRST_MONDAY, 12);
      const thursdays = weekly('thu', FIRST_THURSDAY, 12);
      mockPrismaService.post.findMany.mockResolvedValue([
        ...mondays,
        ...thursdays,
      ]);
      mockPrismaService.contentPerformance.findMany.mockResolvedValue(
        measured(mondays, 0.05),
      );

      const result = await service.getOptimalTime(
        { platform: 'twitter' },
        'org_1',
      );

      expect(result.eligibleCount).toBe(12);
      expect(result.basis).toBe('default');
    });

    it('reads posts and metrics for one organization, not deleted, in scope', async () => {
      await service.getOptimalTime(
        {
          brandId: 'brand_1',
          credentialId: 'credential_1',
          platform: 'twitter',
        },
        'org_1',
      );

      expect(mockPrismaService.post.findMany.mock.calls[0][0].where).toEqual({
        brandId: 'brand_1',
        credentialId: 'credential_1',
        isDeleted: false,
        organizationId: 'org_1',
        platform: 'twitter',
        publishedAt: { gte: new Date(NOW - 90 * DAY), lte: new Date(NOW) },
      });
    });

    it('scopes the metrics read to the organization too', async () => {
      mockPrismaService.post.findMany.mockResolvedValue(
        weekly('mon', FIRST_MONDAY, 2),
      );

      await service.getOptimalTime({ platform: 'twitter' }, 'org_1');

      expect(
        mockPrismaService.contentPerformance.findMany.mock.calls[0][0].where,
      ).toMatchObject({ isDeleted: false, organizationId: 'org_1' });
    });

    it('rejects a timezone that does not exist', async () => {
      await expect(
        service.getOptimalTime(
          { platform: 'twitter', timezone: 'Not/AZone' },
          'org_1',
        ),
      ).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe('bulkSchedule with ai-optimal times', () => {
    const base = {
      brandIds: ['brand_1'],
      contentIds: ['content_1', 'content_2'],
      platforms: ['twitter'],
      schedulingStrategy: 'ai-optimal' as const,
    };

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(Date.parse('2026-10-20T10:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('schedules the default hours in the requested timezone', async () => {
      await service.bulkSchedule(
        { ...base, timezone: 'America/New_York' },
        'org_1',
        'user_1',
      );

      const scheduledAt = mockPrismaService.schedule.create.mock.calls.map(
        ([args]) => args.data.scheduledAt.toISOString(),
      );
      expect(scheduledAt).toEqual([
        '2026-10-21T12:00:00.000Z',
        '2026-10-21T13:00:00.000Z',
      ]);
    });

    it('defaults to UTC without a timezone', async () => {
      await service.bulkSchedule(base, 'org_1', 'user_1');

      expect(
        mockPrismaService.schedule.create.mock.calls[0][0].data.scheduledAt.toISOString(),
      ).toBe('2026-10-21T08:00:00.000Z');
    });

    it('rejects a timezone that does not exist before writing anything', async () => {
      await expect(
        service.bulkSchedule(
          { ...base, timezone: 'Not/AZone' },
          'org_1',
          'user_1',
        ),
      ).rejects.toBeInstanceOf(ValidationException);
      expect(mockPrismaService.schedule.create).not.toHaveBeenCalled();
    });
  });
});
