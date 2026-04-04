import { SlackController } from '@api/services/integrations/slack/controllers/slack.controller';
import { HttpException } from '@nestjs/common';
import { Types } from 'mongoose';

describe('SlackController', () => {
  const mockOrganization = new Types.ObjectId().toString();
  const mockUserId = new Types.ObjectId().toString();
  const mockBrandId = new Types.ObjectId().toString();

  const mockUser = {
    publicMetadata: {
      organization: mockOrganization,
      user: mockUserId,
    },
  };

  const mockBrandsService = {
    findOne: vi.fn(),
  };

  const mockCredentialsService = {
    create: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
  };

  const mockSlackService = {
    disconnect: vi.fn(),
    exchangeCodeForToken: vi.fn(),
    generateAuthUrl: vi.fn().mockReturnValue('https://slack.com/oauth'),
    getUserInfo: vi.fn(),
  };

  let controller: SlackController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new SlackController(
      mockSlackService as any,
      mockCredentialsService as any,
      mockBrandsService as any,
    );
  });

  describe('connect', () => {
    it('rejects when brand does not belong to user organization', async () => {
      mockBrandsService.findOne.mockResolvedValue(null);

      await expect(
        controller.connect(mockUser as any, mockBrandId),
      ).rejects.toBeInstanceOf(HttpException);

      expect(mockBrandsService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: new Types.ObjectId(mockBrandId),
          organization: new Types.ObjectId(mockOrganization),
        }),
      );
      expect(mockCredentialsService.create).not.toHaveBeenCalled();
    });

    it('creates credential using metadata userId, not user._id', async () => {
      mockBrandsService.findOne.mockResolvedValue({ _id: mockBrandId });
      mockCredentialsService.findOne.mockResolvedValue(null);
      mockCredentialsService.create.mockResolvedValue({});

      await controller.connect(mockUser as any, mockBrandId);

      expect(mockCredentialsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user: new Types.ObjectId(mockUserId),
        }),
      );
    });
  });

  describe('verify', () => {
    it('rejects when brand does not belong to user organization', async () => {
      mockBrandsService.findOne.mockResolvedValue(null);

      await expect(
        controller.verify(mockUser as any, mockBrandId, 'code', 'state'),
      ).rejects.toBeInstanceOf(HttpException);

      expect(mockSlackService.exchangeCodeForToken).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('rejects when brand does not belong to user organization', async () => {
      mockBrandsService.findOne.mockResolvedValue(null);

      await expect(
        controller.disconnect(mockUser as any, mockBrandId),
      ).rejects.toBeInstanceOf(HttpException);

      expect(mockSlackService.disconnect).not.toHaveBeenCalled();
    });

    it('uses organization from metadata, not from request body', async () => {
      mockBrandsService.findOne.mockResolvedValue({ _id: mockBrandId });
      mockSlackService.disconnect.mockResolvedValue({});

      await controller.disconnect(mockUser as any, mockBrandId);

      expect(mockSlackService.disconnect).toHaveBeenCalledWith(
        mockOrganization,
        mockBrandId,
      );
    });
  });
});
