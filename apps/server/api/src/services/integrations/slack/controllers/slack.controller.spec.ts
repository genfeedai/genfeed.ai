vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => data,
  ),
}));

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
    organizationId: mockOrganization,
    userId: mockUserId,
  } as unknown as User;

  const mockBrandsService = {
    findOne: vi.fn(),
  };

  const mockCredentialsService = {
    beginOAuthForBrand: vi.fn(),
    findPendingOAuthCredential: vi.fn(),
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
        controller.connect({} as never, mockUser, mockBrandId),
      ).rejects.toBeInstanceOf(HttpException);

      expect(mockBrandsService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockBrandId,
          organizationId: mockOrganization,
        }),
      );
      expect(mockCredentialsService.beginOAuthForBrand).not.toHaveBeenCalled();
    });

    it('starts OAuth using the authenticated tenant scope', async () => {
      const brand = { id: mockBrandId, organizationId: mockOrganization };
      mockBrandsService.findOne.mockResolvedValue(brand);
      mockCredentialsService.beginOAuthForBrand.mockResolvedValue({
        credential: { id: 'credential-id' },
        state: 'opaque-oauth-state',
      });

      const result = await controller.connect(
        {} as never,
        mockUser,
        mockBrandId,
      );

      expect(mockCredentialsService.beginOAuthForBrand).toHaveBeenCalledWith(
        brand,
        mockUserId,
        'slack',
        { isConnected: false },
      );
      expect(result).toEqual({ url: 'https://slack.com/oauth' });
      expect(mockSlackService.generateAuthUrl).toHaveBeenCalledWith(
        'opaque-oauth-state',
      );
    });
  });

  describe('verify', () => {
    it('rejects a state outside the authenticated tenant scope', async () => {
      mockCredentialsService.findPendingOAuthCredential.mockResolvedValue(null);

      await expect(
        controller.verify({} as never, mockUser, 'code', 'state'),
      ).rejects.toBeInstanceOf(HttpException);

      expect(
        mockCredentialsService.findPendingOAuthCredential,
      ).toHaveBeenCalledWith('state', 'slack', {
        organizationId: mockOrganization,
        userId: mockUserId,
      });
      expect(mockSlackService.exchangeCodeForToken).not.toHaveBeenCalled();
    });
  });
});
