import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { IngredientNotificationOwnerService } from '@api/endpoints/webhooks/services/ingredient-notification-owner.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('IngredientNotificationOwnerService', () => {
  const getOrganizationCreditsBalance = vi.fn();
  let service: IngredientNotificationOwnerService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        IngredientNotificationOwnerService,
        {
          provide: CreditsUtilsService,
          useValue: { getOrganizationCreditsBalance },
        },
        { provide: LoggerService, useValue: { warn: vi.fn() } },
      ],
    }).compile();
    service = module.get(IngredientNotificationOwnerService);
  });

  it('names the user, the organization and the credits it has left', async () => {
    getOrganizationCreditsBalance.mockResolvedValue(13);

    await expect(
      service.find({
        id: 'ingredient_1',
        organization: { label: 'Acme' },
        organizationId: 'org_1',
        user: {
          email: 'owner@example.com',
          firstName: 'Ada',
          lastName: 'Owner',
        },
      }),
    ).resolves.toEqual({
      creditBalance: 13,
      organizationId: 'org_1',
      organizationLabel: 'Acme',
      userEmail: 'owner@example.com',
      userName: 'Ada Owner',
    });
  });

  it('still names the account when the balance cannot be read', async () => {
    getOrganizationCreditsBalance.mockRejectedValue(new Error('ledger down'));

    await expect(
      service.find({
        id: 'ingredient_2',
        organizationId: 'org_2',
        user: { email: 'owner@example.com' },
      }),
    ).resolves.toEqual({
      creditBalance: undefined,
      organizationId: 'org_2',
      organizationLabel: undefined,
      userEmail: 'owner@example.com',
      userName: undefined,
    });
  });
});
