import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { TelegramBotConnectController } from '@api/services/integrations/telegram/controllers/telegram-bot-connect.controller';
import {
  TelegramApiError,
  type TelegramBotApiService,
} from '@api/services/integrations/telegram/services/telegram-bot-api.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: (error: unknown) => ({ badRequest: error }),
  serializeSingle: (_request: unknown, _serializer: unknown, data: unknown) =>
    data,
}));

const user = { organizationId: 'org-1', userId: 'user-1' } as unknown as User;
const request = {} as Request;

function buildController(
  getMe: () => Promise<{ id: number; username?: string }>,
) {
  const pending: Array<{ accessToken?: string; brandId: string }> = [];
  const profiles: Array<{ handle?: string | null; id?: string | null }> = [];
  const credentialsService = {
    createPendingForBrand: async (
      brand: { id: string },
      _userId: string,
      _platform: string,
      fields: { accessToken?: string },
    ) => {
      pending.push({ accessToken: fields.accessToken, brandId: brand.id });
      return { id: 'credential-1' };
    },
    updateExternalProfile: async (
      id: string,
      _organizationId: string,
      profile: { handle?: string | null; id?: string | null },
    ) => {
      profiles.push(profile);
      return { id, isConnected: true };
    },
  };
  const brandsService = {
    findOne: async (where: { id: string; organizationId: string }) =>
      where.id === 'brand-1' && where.organizationId === 'org-1'
        ? { id: 'brand-1', organizationId: 'org-1' }
        : null,
  };
  const silent = () => undefined;
  const controller = new TelegramBotConnectController(
    { getMe } as unknown as TelegramBotApiService,
    brandsService as unknown as BrandsService,
    credentialsService as unknown as CredentialsService,
    { warn: silent } as unknown as LoggerService,
  );
  return { controller, pending, profiles };
}

describe('TelegramBotConnectController', () => {
  it('connects a bot as an account of the brand, identified by the bot', async () => {
    const { controller, pending, profiles } = buildController(async () => ({
      id: 123456,
      username: 'genfeed_bot',
    }));

    const result = await controller.connect(request, user, {
      botToken: ' 123456:ABC-def_ghi ',
      brandId: 'brand-1',
    });

    expect(result).toEqual({ id: 'credential-1', isConnected: true });
    expect(pending).toEqual([
      { accessToken: '123456:ABC-def_ghi', brandId: 'brand-1' },
    ]);
    expect(profiles).toEqual([
      { handle: 'genfeed_bot', id: '123456', name: 'genfeed_bot' },
    ]);
  });

  it('refuses a brand outside the organization', async () => {
    const { controller, pending } = buildController(async () => ({ id: 1 }));

    const result = await controller.connect(request, user, {
      botToken: '123456:ABC',
      brandId: 'brand-2',
    });

    expect(result).toMatchObject({ badRequest: { title: 'Invalid payload' } });
    expect(pending).toEqual([]);
  });

  it('refuses a token that is not shaped like a bot token without calling Telegram', async () => {
    const getMe = vi.fn();
    const { controller, pending } = buildController(getMe);

    await expect(
      controller.connect(request, user, {
        botToken: 'not-a-token',
        brandId: 'brand-1',
      }),
    ).rejects.toMatchObject({ status: 400 });

    expect(getMe).not.toHaveBeenCalled();
    expect(pending).toEqual([]);
  });

  it('refuses a token Telegram rejects', async () => {
    const { controller, pending } = buildController(async () => {
      throw new TelegramApiError('Telegram getMe failed', 'token_invalid', 401);
    });

    await expect(
      controller.connect(request, user, {
        botToken: '123456:ABC',
        brandId: 'brand-1',
      }),
    ).rejects.toMatchObject({ status: 400 });

    expect(pending).toEqual([]);
  });
});
