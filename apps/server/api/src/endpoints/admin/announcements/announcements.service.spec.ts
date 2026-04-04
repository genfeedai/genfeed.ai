import { AnnouncementsService as AnnouncementsCollectionService } from '@api/collections/announcements/services/announcements.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AdminAnnouncementsService } from '@api/endpoints/admin/announcements/announcements.service';
import type { BroadcastAnnouncementDto } from '@api/endpoints/admin/announcements/dto/broadcast-announcement.dto';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { REDIS_EVENTS } from '@genfeedai/integrations';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

vi.mock('@api/shared/utils/encryption/encryption.util');

const mockTweetFn = vi.fn().mockResolvedValue({ data: { id: 'tweet-123' } });
vi.mock('twitter-api-v2', () => ({
  TwitterApi: vi.fn().mockImplementation(function () {
    return { v2: { tweet: mockTweetFn } };
  }),
}));

describe('AdminAnnouncementsService', () => {
  let service: AdminAnnouncementsService;
  let announcementsCollectionService: vi.Mocked<AnnouncementsCollectionService>;
  let credentialsService: vi.Mocked<CredentialsService>;
  let loggerService: vi.Mocked<LoggerService>;
  let redisService: vi.Mocked<RedisService>;

  const authorId = new Types.ObjectId().toString();
  const organizationId = new Types.ObjectId().toString();

  const mockAnnouncement = {
    _id: new Types.ObjectId(),
    body: 'Test announcement',
    channels: ['discord'],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAnnouncementsService,
        {
          provide: AnnouncementsCollectionService,
          useValue: {
            createAnnouncement: vi.fn(),
            getAll: vi.fn(),
          },
        },
        {
          provide: CredentialsService,
          useValue: { findOne: vi.fn() },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
        {
          provide: RedisService,
          useValue: { publish: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<AdminAnnouncementsService>(AdminAnnouncementsService);
    announcementsCollectionService = module.get(AnnouncementsCollectionService);
    credentialsService = module.get(CredentialsService);
    loggerService = module.get(LoggerService);
    redisService = module.get(RedisService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('broadcast', () => {
    it('should broadcast to discord and persist announcement', async () => {
      const dto: BroadcastAnnouncementDto = {
        body: 'Hello world',
        channels: ['discord'],
        discordChannelId: 'channel-123',
      };

      announcementsCollectionService.createAnnouncement.mockResolvedValue(
        mockAnnouncement as never,
      );
      redisService.publish.mockResolvedValue(undefined);

      const result = await service.broadcast(authorId, organizationId, dto);

      expect(redisService.publish).toHaveBeenCalledWith(
        REDIS_EVENTS.DISCORD_SEND_TO_CHANNEL,
        expect.objectContaining({
          channelId: 'channel-123',
          message: 'Hello world',
          orgId: organizationId,
        }),
      );
      expect(
        announcementsCollectionService.createAnnouncement,
      ).toHaveBeenCalled();
      expect(result).toBe(mockAnnouncement);
    });

    it('should throw BadRequestException when discord channel is missing', async () => {
      const dto: BroadcastAnnouncementDto = {
        body: 'Hello',
        channels: ['discord'],
      };

      await expect(
        service.broadcast(authorId, organizationId, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should publish to twitter when twitter channel is included', async () => {
      const dto: BroadcastAnnouncementDto = {
        body: 'Tweet me',
        channels: ['twitter'],
      };

      const mockCredential = {
        accessToken: 'encrypted-token',
        externalHandle: '@testhandle',
      };

      credentialsService.findOne.mockResolvedValue(mockCredential as never);
      vi.mocked(EncryptionUtil.decrypt).mockReturnValue('plain-token');
      mockTweetFn.mockResolvedValue({ data: { id: 'tweet-123' } });

      announcementsCollectionService.createAnnouncement.mockResolvedValue(
        mockAnnouncement as never,
      );

      const result = await service.broadcast(authorId, organizationId, dto);

      expect(credentialsService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ platform: CredentialPlatform.TWITTER }),
      );
      expect(mockTweetFn).toHaveBeenCalledWith('Tweet me');
      expect(
        announcementsCollectionService.createAnnouncement,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          tweetId: 'tweet-123',
          tweetUrl: expect.stringContaining('tweet-123'),
        }),
      );
      expect(result).toBe(mockAnnouncement);
    });

    it('should use tweetText over body when provided for twitter', async () => {
      const dto: BroadcastAnnouncementDto = {
        body: 'Full announcement body',
        channels: ['twitter'],
        tweetText: 'Short tweet',
      };

      credentialsService.findOne.mockResolvedValue({
        accessToken: 'enc',
        externalHandle: 'user',
      } as never);
      vi.mocked(EncryptionUtil.decrypt).mockReturnValue('token');
      mockTweetFn.mockResolvedValue({ data: { id: 'tw-1' } });

      announcementsCollectionService.createAnnouncement.mockResolvedValue(
        mockAnnouncement as never,
      );

      await service.broadcast(authorId, organizationId, dto);

      expect(mockTweetFn).toHaveBeenCalledWith('Short tweet');
    });

    it('should continue and persist if twitter credential is missing', async () => {
      const dto: BroadcastAnnouncementDto = {
        body: 'Announcement',
        channels: ['twitter'],
      };

      credentialsService.findOne.mockResolvedValue(null);
      announcementsCollectionService.createAnnouncement.mockResolvedValue(
        mockAnnouncement as never,
      );

      const result = await service.broadcast(authorId, organizationId, dto);

      expect(result).toBe(mockAnnouncement);
      expect(
        announcementsCollectionService.createAnnouncement,
      ).toHaveBeenCalledWith(expect.objectContaining({ tweetId: undefined }));
    });

    it('should continue and persist if discord publish fails', async () => {
      const dto: BroadcastAnnouncementDto = {
        body: 'Discord error',
        channels: ['discord'],
        discordChannelId: 'ch-fail',
      };

      redisService.publish.mockRejectedValue(new Error('Redis down'));
      announcementsCollectionService.createAnnouncement.mockResolvedValue(
        mockAnnouncement as never,
      );

      const result = await service.broadcast(authorId, organizationId, dto);

      expect(loggerService.error).toHaveBeenCalled();
      expect(result).toBe(mockAnnouncement);
    });

    it('should persist with no channels', async () => {
      const dto: BroadcastAnnouncementDto = {
        body: 'Silent announcement',
        channels: [],
      };

      announcementsCollectionService.createAnnouncement.mockResolvedValue(
        mockAnnouncement as never,
      );

      const result = await service.broadcast(authorId, organizationId, dto);

      expect(redisService.publish).not.toHaveBeenCalled();
      expect(credentialsService.findOne).not.toHaveBeenCalled();
      expect(result).toBe(mockAnnouncement);
    });
  });

  describe('getHistory', () => {
    it('should return all announcements', async () => {
      const mockAnnouncements = [mockAnnouncement];
      announcementsCollectionService.getAll.mockResolvedValue(
        mockAnnouncements as never,
      );

      const result = await service.getHistory();

      expect(announcementsCollectionService.getAll).toHaveBeenCalled();
      expect(result).toBe(mockAnnouncements);
    });

    it('should return empty array when no announcements exist', async () => {
      announcementsCollectionService.getAll.mockResolvedValue([]);

      const result = await service.getHistory();

      expect(result).toEqual([]);
    });
  });
});
