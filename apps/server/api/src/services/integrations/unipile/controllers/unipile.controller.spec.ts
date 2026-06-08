import { UnipileController } from '@api/services/integrations/unipile/controllers/unipile.controller';
import { UnipileService } from '@api/services/integrations/unipile/services/unipile.service';
import type { User } from '@clerk/backend';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

describe('UnipileController', () => {
  let controller: UnipileController;

  const mockUnipileService = {
    configure: vi.fn(),
    getStatus: vi.fn(),
    listAccounts: vi.fn(),
    listCalendarEvents: vi.fn(),
    listEmails: vi.fn(),
    listMessages: vi.fn(),
    sendEmail: vi.fn(),
  };

  const user = {
    publicMetadata: {
      organization: 'org_1',
    },
  } as unknown as User;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UnipileController],
      providers: [{ provide: UnipileService, useValue: mockUnipileService }],
    }).compile();

    controller = module.get<UnipileController>(UnipileController);
  });

  it('derives organization scope from current user metadata', async () => {
    mockUnipileService.getStatus.mockResolvedValue({
      allowedAccountIds: [],
      configured: true,
    });

    await controller.status(user);

    expect(mockUnipileService.getStatus).toHaveBeenCalledWith('org_1');
  });

  it('rejects requests without organization context', async () => {
    const userWithoutOrg = {
      publicMetadata: {},
    } as unknown as User;

    expect(() => controller.status(userWithoutOrg)).toThrow(
      BadRequestException,
    );
  });
});
