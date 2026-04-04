import { ConfigService } from '@api/config/config.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { BotActionExecutorService } from '@api/services/reply-bot/bot-action-executor.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('BotActionExecutorService', () => {
  let service: BotActionExecutorService;

  const mockConfigService = {
    get: vi.fn(() => 'test-value'),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockInstagramService = {
    postComment: vi.fn(),
    sendCommentReplyDm: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotActionExecutorService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: InstagramService, useValue: mockInstagramService },
      ],
    }).compile();

    service = module.get<BotActionExecutorService>(BotActionExecutorService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('postReply', () => {
    it('should route to Instagram when platform is instagram', async () => {
      const credential = {
        accessToken: 'encrypted-token',
        brandId: 'brand-1',
        organizationId: 'org-1',
        platform: 'instagram',
      };
      const targetContent = {
        authorId: 'author-1',
        authorUsername: 'user1',
        id: 'media-123',
      };
      mockInstagramService.postComment.mockResolvedValue({
        commentId: 'comment-1',
      });

      const result = await service.postReply(
        credential,
        targetContent,
        'Nice post!',
      );

      expect(result.success).toBe(true);
      expect(result.contentId).toBe('comment-1');
      expect(mockInstagramService.postComment).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        'media-123',
        'Nice post!',
      );
    });

    it('should return error for Instagram when organizationId is missing', async () => {
      const credential = { accessToken: 'token', platform: 'instagram' };
      const targetContent = {
        authorId: 'author-1',
        authorUsername: 'user1',
        id: 'media-123',
      };

      const result = await service.postReply(
        credential,
        targetContent,
        'reply',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('organizationId and brandId required');
    });
  });

  describe('sendDm', () => {
    it('should route to Instagram DM when platform is instagram', async () => {
      const credential = {
        accessToken: 'token',
        brandId: 'brand-1',
        organizationId: 'org-1',
        platform: 'instagram',
      };
      mockInstagramService.sendCommentReplyDm.mockResolvedValue(undefined);

      const result = await service.sendDm(credential, 'recipient-1', 'Hello!');

      expect(result.success).toBe(true);
      expect(mockInstagramService.sendCommentReplyDm).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        'recipient-1',
        'Hello!',
      );
    });

    it('should return error for Instagram DM when organizationId is missing', async () => {
      const credential = { accessToken: 'token', platform: 'instagram' };

      const result = await service.sendDm(credential, 'recipient-1', 'Hello!');

      expect(result.success).toBe(false);
      expect(result.error).toContain('organizationId and brandId required');
    });
  });

  describe('executeActions', () => {
    it('should return only reply result when no dmText provided', async () => {
      const credential = {
        accessToken: 'token',
        brandId: 'brand-1',
        organizationId: 'org-1',
        platform: 'instagram',
      };
      const targetContent = {
        authorId: 'author-1',
        authorUsername: 'user1',
        id: 'media-1',
      };
      mockInstagramService.postComment.mockResolvedValue({ commentId: 'c-1' });

      const result = await service.executeActions(
        credential,
        targetContent,
        'reply text',
      );

      expect(result.reply.success).toBe(true);
      expect(result.dm).toBeUndefined();
    });

    it('should not send DM when reply fails', async () => {
      const credential = { accessToken: 'token', platform: 'instagram' };
      const targetContent = {
        authorId: 'author-1',
        authorUsername: 'user1',
        id: 'media-1',
      };

      const result = await service.executeActions(
        credential,
        targetContent,
        'reply',
        'dm text',
        0,
      );

      expect(result.reply.success).toBe(false);
      expect(result.dm).toBeUndefined();
    });

    it('should send DM after successful reply with no delay', async () => {
      const credential = {
        accessToken: 'token',
        brandId: 'brand-1',
        organizationId: 'org-1',
        platform: 'instagram',
      };
      const targetContent = {
        authorId: 'author-1',
        authorUsername: 'user1',
        id: 'media-1',
      };
      mockInstagramService.postComment.mockResolvedValue({ commentId: 'c-1' });
      mockInstagramService.sendCommentReplyDm.mockResolvedValue(undefined);

      const result = await service.executeActions(
        credential,
        targetContent,
        'reply',
        'dm text',
        0,
      );

      expect(result.reply.success).toBe(true);
      expect(result.dm).toBeDefined();
      expect(result.dm!.success).toBe(true);
    });
  });

  describe('validateCredential', () => {
    it('should return true for valid credential with accessTokenSecret', () => {
      const credential = { accessToken: 'token', accessTokenSecret: 'secret' };

      expect(service.validateCredential(credential)).toBe(true);
    });

    it('should return true for valid credential with refreshToken', () => {
      const credential = { accessToken: 'token', refreshToken: 'refresh' };

      expect(service.validateCredential(credential)).toBe(true);
    });

    it('should return false when accessToken is missing', () => {
      const credential = { accessTokenSecret: 'secret' };

      expect(service.validateCredential(credential)).toBe(false);
    });

    it('should return false when both accessTokenSecret and refreshToken are missing', () => {
      const credential = { accessToken: 'token' };

      expect(service.validateCredential(credential)).toBe(false);
    });
  });
});
