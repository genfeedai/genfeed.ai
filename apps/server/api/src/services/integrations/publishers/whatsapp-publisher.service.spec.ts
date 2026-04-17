import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import { ConfigService } from '@api/config/config.service';
import type { PublishContext } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { WhatsappPublisherService } from '@api/services/integrations/publishers/whatsapp-publisher.service';
import { WhatsappService } from '@api/services/integrations/whatsapp/services/whatsapp.service';
import { CredentialPlatform, PostCategory, PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('WhatsappPublisherService', () => {
  let service: WhatsappPublisherService;
  let logger: vi.Mocked<LoggerService>;
  let whatsappService: vi.Mocked<WhatsappService>;

  const orgId = new Types.ObjectId('507f1f77bcf86cd799439011');
  const brandId = new Types.ObjectId('507f1f77bcf86cd799439012');
  const postId = new Types.ObjectId('507f1f77bcf86cd799439013');
  const credentialId = new Types.ObjectId('507f1f77bcf86cd799439015');
  const ingredientId = new Types.ObjectId('507f1f77bcf86cd799439016');

  const mockCredential = {
    _id: credentialId,
    externalId: '+15551234567',
    isDeleted: false,
    organization: orgId,
    platform: CredentialPlatform.WHATSAPP,
  } as unknown as CredentialDocument;

  const mockOrganization = {
    _id: orgId,
    name: 'Test Org',
  } as unknown as OrganizationDocument;

  const makePost = (overrides: Partial<PostEntity> = {}): PostEntity =>
    ({
      _id: postId,
      brand: brandId,
      category: PostCategory.TEXT,
      description: '<p>Hello <strong>WhatsApp</strong></p>',
      ingredients: [],
      isDeleted: false,
      organization: orgId,
      status: PostStatus.DRAFT,
      ...overrides,
    }) as unknown as PostEntity;

  const makeContext = (post: PostEntity): PublishContext => ({
    brandId: brandId.toString(),
    credential: mockCredential,
    organization: mockOrganization,
    organizationId: orgId.toString(),
    post,
    postId: postId.toString(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappPublisherService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue('test-value'),
            ingredientsEndpoint: 'https://api.test.com/ingredients',
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: WhatsappService,
          useValue: {
            sendMediaMessage: vi.fn(),
            sendTextMessage: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WhatsappPublisherService>(WhatsappPublisherService);
    logger = module.get(LoggerService) as vi.Mocked<LoggerService>;
    whatsappService = module.get(WhatsappService) as vi.Mocked<WhatsappService>;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have WHATSAPP platform', () => {
      expect(service.platform).toBe(CredentialPlatform.WHATSAPP);
    });

    it('should support text-only posts', () => {
      expect(service.supportsTextOnly).toBe(true);
    });

    it('should support images', () => {
      expect(service.supportsImages).toBe(true);
    });

    it('should NOT support videos', () => {
      expect(service.supportsVideos).toBe(false);
    });

    it('should NOT support carousel', () => {
      expect(service.supportsCarousel).toBe(false);
    });

    it('should NOT support threads', () => {
      expect(service.supportsThreads).toBe(false);
    });
  });

  describe('publish — text-only', () => {
    it('should send a text message for text-only posts', async () => {
      whatsappService.sendTextMessage.mockResolvedValue({ sid: 'SM-text-001' });
      const context = makeContext(makePost());

      const result = await service.publish(context);

      expect(result.success).toBe(true);
      expect(result.externalId).toBe('SM-text-001');
      expect(result.platform).toBe(CredentialPlatform.WHATSAPP);
      expect(whatsappService.sendTextMessage).toHaveBeenCalledWith({
        body: expect.any(String),
        to: '+15551234567',
      });
      expect(whatsappService.sendMediaMessage).not.toHaveBeenCalled();
    });

    it('should strip HTML from the message body', async () => {
      whatsappService.sendTextMessage.mockResolvedValue({ sid: 'SM-text-002' });
      const context = makeContext(
        makePost({ description: '<p>Hello <b>World</b></p>' }),
      );

      await service.publish(context);

      const { body } = whatsappService.sendTextMessage.mock.calls[0][0];
      expect(body).not.toContain('<p>');
      expect(body).not.toContain('<b>');
    });
  });

  describe('publish — image posts', () => {
    const imagePost = makePost({
      category: PostCategory.IMAGE,
      ingredients: [ingredientId],
    });

    it('should send a media message for image posts', async () => {
      whatsappService.sendMediaMessage.mockResolvedValue({ sid: 'SM-img-001' });
      const context = makeContext(imagePost);

      const result = await service.publish(context);

      expect(result.success).toBe(true);
      expect(result.externalId).toBe('SM-img-001');
      expect(whatsappService.sendMediaMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaUrl: expect.any(String),
          to: '+15551234567',
        }),
      );
    });
  });

  describe('publish — error handling', () => {
    it('should return a failed result when recipient number is missing', async () => {
      const credentialNoRecipient = {
        ...mockCredential,
        externalId: undefined,
      } as unknown as CredentialDocument;
      const context = {
        ...makeContext(makePost()),
        credential: credentialNoRecipient,
      };

      const result = await service.publish(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        'WhatsApp recipient number not configured',
      );
      expect(logger.error).toHaveBeenCalled();
    });

    it('should return a failed result when Twilio returns no SID', async () => {
      whatsappService.sendTextMessage.mockResolvedValue({
        sid: null as unknown as string,
      });
      const context = makeContext(makePost());

      const result = await service.publish(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to get message SID from Twilio');
    });

    it('should throw when the WhatsApp service throws', async () => {
      whatsappService.sendTextMessage.mockRejectedValue(
        new Error('Twilio outage'),
      );
      const context = makeContext(makePost());

      await expect(service.publish(context)).rejects.toThrow('Twilio outage');
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed to publish'),
        expect.objectContaining({ error: 'Twilio outage' }),
      );
    });
  });

  describe('buildPostUrl', () => {
    it('should always return an empty string', () => {
      const result = service.buildPostUrl('SM-123', mockCredential);
      expect(result).toBe('');
    });
  });
});
