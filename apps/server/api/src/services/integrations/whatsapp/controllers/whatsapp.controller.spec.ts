import { BrandsService } from '@api/collections/brands/services/brands.service';
import { WhatsappController } from '@api/services/integrations/whatsapp/controllers/whatsapp.controller';
import { WhatsappService } from '@api/services/integrations/whatsapp/services/whatsapp.service';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn(() => ({
    organization: new Types.ObjectId().toString(),
    user: new Types.ObjectId().toString(),
  })),
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((err: unknown) => ({ error: err })),
}));

import { returnBadRequest } from '@api/helpers/utils/response/response.util';

describe('WhatsappController', () => {
  let controller: WhatsappController;
  let whatsappService: vi.Mocked<WhatsappService>;
  let brandsService: vi.Mocked<BrandsService>;
  let loggerService: vi.Mocked<LoggerService>;

  const mockUser = {} as User;
  const mockBrandId = new Types.ObjectId().toString();
  const mockBrand = { _id: new Types.ObjectId(), isDeleted: false };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappController],
      providers: [
        {
          provide: WhatsappService,
          useValue: {
            getMessageStatus: vi.fn(),
            sendMediaMessage: vi.fn(),
            sendTemplateMessage: vi.fn(),
            sendTextMessage: vi.fn(),
          },
        },
        {
          provide: BrandsService,
          useValue: { findOne: vi.fn() },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
      ],
    }).compile();

    controller = module.get<WhatsappController>(WhatsappController);
    whatsappService = module.get(WhatsappService);
    brandsService = module.get(BrandsService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('sendMessage', () => {
    it('should send text message when no mediaUrl', async () => {
      brandsService.findOne.mockResolvedValue(mockBrand as never);
      whatsappService.sendTextMessage.mockResolvedValue({
        sid: 'SM123',
      } as never);

      const body = {
        brandId: mockBrandId,
        message: 'Hello!',
        to: '+1234567890',
      };
      const result = await controller.sendMessage(mockUser, body as never);

      expect(whatsappService.sendTextMessage).toHaveBeenCalledWith(
        expect.objectContaining({ to: '+1234567890' }),
      );
      expect(result).toEqual({ data: { sid: 'SM123' } });
    });

    it('should send media message when mediaUrl is provided', async () => {
      brandsService.findOne.mockResolvedValue(mockBrand as never);
      whatsappService.sendMediaMessage.mockResolvedValue({
        sid: 'SM456',
      } as never);

      const body = {
        brandId: mockBrandId,
        mediaUrl: 'https://cdn.example.com/image.jpg',
        message: 'Check this out',
        to: '+1234567890',
      };

      const result = await controller.sendMessage(mockUser, body as never);

      expect(whatsappService.sendMediaMessage).toHaveBeenCalled();
      expect(whatsappService.sendTextMessage).not.toHaveBeenCalled();
      expect(result).toEqual({ data: { sid: 'SM456' } });
    });

    it('should return bad request when brandId is missing', async () => {
      const body = { message: 'No brand', to: '+1' };
      await controller.sendMessage(mockUser, body as never);

      expect(returnBadRequest).toHaveBeenCalledWith(
        expect.objectContaining({ detail: 'Brand ID is required' }),
      );
      expect(whatsappService.sendTextMessage).not.toHaveBeenCalled();
    });

    it('should return bad request when brand is not found', async () => {
      brandsService.findOne.mockResolvedValue(null);

      const body = { brandId: mockBrandId, message: 'Hi', to: '+1' };
      await controller.sendMessage(mockUser, body as never);

      expect(returnBadRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: 'You do not have access to this brand',
        }),
      );
    });
  });

  describe('sendTemplateMessage', () => {
    it('should send a template message', async () => {
      brandsService.findOne.mockResolvedValue(mockBrand as never);
      whatsappService.sendTemplateMessage.mockResolvedValue({
        sid: 'SM789',
      } as never);

      const body = {
        brandId: mockBrandId,
        templateSid: 'HX123',
        to: '+19998887777',
      };

      const result = await controller.sendTemplateMessage(
        mockUser,
        body as never,
      );

      expect(whatsappService.sendTemplateMessage).toHaveBeenCalled();
      expect(result).toEqual({ data: { sid: 'SM789' } });
    });

    it('should return bad request when brandId is missing on template', async () => {
      const body = { templateSid: 'HX123', to: '+1' };
      await controller.sendTemplateMessage(mockUser, body as never);

      expect(returnBadRequest).toHaveBeenCalledWith(
        expect.objectContaining({ detail: 'Brand ID is required' }),
      );
    });

    it('should return bad request when brand is not found for template', async () => {
      brandsService.findOne.mockResolvedValue(null);

      const body = { brandId: mockBrandId, templateSid: 'HX123', to: '+1' };
      await controller.sendTemplateMessage(mockUser, body as never);

      expect(returnBadRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: 'You do not have access to this brand',
        }),
      );
    });
  });

  describe('getMessageStatus', () => {
    it('should return message status', async () => {
      brandsService.findOne.mockResolvedValue(mockBrand as never);
      whatsappService.getMessageStatus.mockResolvedValue({
        sid: 'SM111',
        status: 'delivered',
      } as never);

      const result = await controller.getMessageStatus(
        mockUser,
        'SM111',
        mockBrandId,
      );

      expect(whatsappService.getMessageStatus).toHaveBeenCalledWith('SM111');
      expect(result).toEqual({ data: { sid: 'SM111', status: 'delivered' } });
    });

    it('should return bad request when brandId query param is missing', async () => {
      await controller.getMessageStatus(mockUser, 'SM999', '');

      expect(returnBadRequest).toHaveBeenCalledWith(
        expect.objectContaining({ detail: 'Brand ID is required' }),
      );
    });

    it('should return bad request when brand not found for status check', async () => {
      brandsService.findOne.mockResolvedValue(null);

      await controller.getMessageStatus(mockUser, 'SM999', mockBrandId);

      expect(returnBadRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: 'You do not have access to this brand',
        }),
      );
    });
  });
});
