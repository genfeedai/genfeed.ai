import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { SlackController } from '@api/services/integrations/slack/controllers/slack.controller';
import type { SlackService } from '@api/services/integrations/slack/services/slack.service';
import { HttpException } from '@nestjs/common';

describe('SlackController', () => {
  const mockOrganization = 'test-object-id';
  const mockUserId = 'test-object-id';
  const mockBrandId = 'test-object-id';

  const mockUser = {
    publicMetadata: {
      organization: mockOrganization,
      user: mockUserId,
    },
  } as unknown as User;

  const mockBrandsService = {
    findOne: vi.fn(),
  };

  const mockCredentialsService = {
    create: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
  };

  const mockSlackService = {
    exchangeCodeForToken: vi.fn(),
    generateAuthUrl: vi.fn().mockReturnValue('https://slack.com/oauth'),
    getUserInfo: vi.fn(),
  };

  let controller: SlackController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new SlackController(
      mockSlackService as unknown as SlackService,
      mockCredentialsService as unknown as CredentialsService,
      mockBrandsService as unknown as BrandsService,
    );
  });

  describe('connect', () => {
    it('rejects when brand does not belong to user organization', async () => {
      mockBrandsService.findOne.mockResolvedValue(null);

      await expect(
        controller.connect(mockUser, mockBrandId),
      ).rejects.toBeInstanceOf(HttpException);

      expect(mockBrandsService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: mockBrandId,
          organization: mockOrganization,
        }),
      );
      expect(mockCredentialsService.create).not.toHaveBeenCalled();
    });

    it('creates credential using metadata userId, not user.id', async () => {
      mockBrandsService.findOne.mockResolvedValue({ _id: mockBrandId });
      mockCredentialsService.findOne.mockResolvedValue(null);
      mockCredentialsService.create.mockResolvedValue({});

      const result = await controller.connect(mockUser, mockBrandId);

      expect(mockCredentialsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          oauthState: result.state,
          user: mockUserId,
        }),
      );
      expect(result.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(mockSlackService.generateAuthUrl).toHaveBeenCalledWith(
        result.state,
      );
    });
  });

  describe('verify', () => {
    it('rejects when brand does not belong to user organization', async () => {
      mockBrandsService.findOne.mockResolvedValue(null);

      await expect(
        controller.verify(mockUser, mockBrandId, 'code', 'state'),
      ).rejects.toBeInstanceOf(HttpException);

      expect(mockSlackService.exchangeCodeForToken).not.toHaveBeenCalled();
    });
  });
});
