import type { BotDocument } from '@api/collections/bots/schemas/bot.schema';
import { BotsLivestreamService } from '@api/collections/bots/services/bots-livestream.service';
import {
  lazyTenantResult,
  sessionOrganizationId,
  targetOrganizationId,
} from '@api-test/helpers/tenant-read.fixture';
import {
  getTenantContext,
  runWithTenantContext,
} from '@libs/prisma/tenant-context';

describe('Bot livestream persistence tenant contexts (#6176)', () => {
  const bot = {
    id: 'bot-target',
    organizationId: targetOrganizationId,
    userId: 'user-target',
    brandId: 'brand-target',
    targets: [],
  } as unknown as BotDocument;
  const row = {
    id: 'session-target',
    organizationId: targetOrganizationId,
    botId: bot.id,
    userId: 'user-target',
    brandId: 'brand-target',
    isDeleted: false,
    data: {
      context: { source: 'none' },
      status: 'stopped',
      platformStates: [],
    },
  };

  it.each(['existing', 'create', 'update'] as const)(
    'awaits %s session queries in the session organization',
    async (operation) => {
      const capture = vi.fn();
      const findFirst = vi.fn(() =>
        lazyTenantResult(operation === 'create' ? null : row, capture),
      );
      const create = vi.fn(() => lazyTenantResult(row, capture));
      const update = vi.fn(() =>
        lazyTenantResult(
          { ...row, data: { ...row.data, status: 'active' } },
          capture,
        ),
      );
      const service = Object.create(
        BotsLivestreamService.prototype,
      ) as BotsLivestreamService;
      Object.assign(service, {
        prisma: { livestreamBotSession: { findFirst, create, update } },
      });
      await runWithTenantContext(
        { organizationId: sessionOrganizationId },
        async () => {
          if (operation === 'update') await service.startSession(bot);
          else await service.getOrCreateSession(bot);
          expect(getTenantContext()).toEqual({
            organizationId: sessionOrganizationId,
          });
        },
      );
      expect(findFirst).toHaveBeenCalledWith({
        where: {
          botId: bot.id,
          organizationId: targetOrganizationId,
          isDeleted: false,
        },
      });
      expect(capture).toHaveBeenCalled();
      for (const [context] of capture.mock.calls)
        expect(context).toEqual({ organizationId: targetOrganizationId });
      if (operation === 'create')
        expect(create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              organizationId: targetOrganizationId,
              isDeleted: false,
            }),
          }),
        );
      if (operation === 'update')
        expect(update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              id: row.id,
              organizationId: targetOrganizationId,
              isDeleted: false,
            },
          }),
        );
    },
  );
});
