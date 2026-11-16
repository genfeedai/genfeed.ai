import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import { TelegramGroupConnectController } from '@api/services/integrations/telegram/controllers/telegram-group-connect.controller';
import type { TelegramGroupLinkService } from '@api/services/integrations/telegram/services/telegram-group-link.service';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: (error: unknown) => ({ badRequest: error }),
  serializeSingle: (_request: unknown, _serializer: unknown, data: unknown) =>
    data,
}));

const user = { organizationId: 'org-1', userId: 'user-1' } as unknown as User;
const request = {} as Request;

function buildController() {
  const links: Array<{
    brandId: string;
    organizationId: string;
    userId: string;
  }> = [];
  const brandsService = {
    findOne: async (where: { id: string; organizationId: string }) =>
      where.id === 'brand-1' && where.organizationId === 'org-1'
        ? { id: 'brand-1', organizationId: 'org-1' }
        : null,
  };
  const groupLinkService = {
    createLink: async (scope: (typeof links)[number]) => {
      links.push(scope);
      return { code: 'code', url: 'https://t.me/genfeed_bot?startgroup=code' };
    },
  };
  const controller = new TelegramGroupConnectController(
    brandsService as unknown as BrandsService,
    groupLinkService as unknown as TelegramGroupLinkService,
  );
  return { controller, links };
}

describe('TelegramGroupConnectController', () => {
  it('answers the add-bot link for a brand of the session organization', async () => {
    const { controller, links } = buildController();

    const result = await controller.connect(request, user, {
      brandId: 'brand-1',
    });

    expect(result).toEqual({ url: 'https://t.me/genfeed_bot?startgroup=code' });
    expect(links).toEqual([
      { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
    ]);
  });

  it('refuses a brand outside the session organization', async () => {
    const { controller, links } = buildController();

    const result = await controller.connect(request, user, {
      brandId: 'brand-2',
    });

    expect(result).toEqual({
      badRequest: {
        detail: 'You do not have access to this brand',
        title: 'Invalid payload',
      },
    });
    expect(links).toEqual([]);
  });

  it('requires a brand', async () => {
    const { controller } = buildController();

    const result = await controller.connect(request, user, { brandId: '' });

    expect(result).toEqual({
      badRequest: { detail: 'Brand ID is required', title: 'Invalid payload' },
    });
  });
});
