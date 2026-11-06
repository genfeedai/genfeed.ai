import type { BotDocument } from '@api/collections/bots/schemas/bot.schema';
import { BotsLivestreamService } from '@api/collections/bots/services/bots-livestream.service';
import {
  sessionOrganizationId,
  targetOrganizationId,
} from '@api-test/helpers/tenant-read.fixture';
import {
  getTenantContext,
  runWithTenantContext,
} from '@libs/prisma/tenant-context';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';

type Row = Record<string, unknown>;

/**
 * Prisma delegates are lazy: the query runs, and sees the tenant context,
 * only when awaited. Each operation here runs through the CLOUD tenant guard
 * at that moment, against an in-memory livestream_bot_sessions table.
 */
function lazySessions(rows: Row[]) {
  const lazy = (operation: string, args: Row, run: () => unknown) => ({
    // biome-ignore lint/suspicious/noThenProperty: Deliberately model a lazy Prisma promise to verify tenant context at await time.
    then(
      resolve: (value: unknown) => unknown,
      reject: (error: unknown) => unknown,
    ) {
      try {
        assertTenantScopedQuery({
          args,
          isCloud: true,
          model: 'LivestreamBotSession',
          operation,
          tenantModelNames: new Set(['LivestreamBotSession']),
        });
        return resolve(run());
      } catch (error) {
        return reject(error);
      }
    },
  });
  const matches = (row: Row, where: Row) =>
    Object.entries(where).every(([key, value]) => row[key] === value);
  return {
    create: (args: { data: Row }) =>
      lazy('create', args, () => {
        const row = { id: 'session-target', ...args.data };
        rows.push(row);
        return row;
      }),
    findFirst: (args: { where: Row }) =>
      lazy(
        'findFirst',
        args,
        () => rows.find((row) => matches(row, args.where)) ?? null,
      ),
    update: (args: { data: Row; where: Row }) =>
      lazy('update', args, () => {
        const row = rows.find((item) => matches(item, args.where));
        if (!row) throw new Error('Record to update not found.');
        return Object.assign(row, args.data);
      }),
  };
}

describe('Bot livestream persistence tenant contexts (#6176)', () => {
  const bot = {
    brandId: 'brand-target',
    id: 'bot-target',
    organizationId: targetOrganizationId,
    targets: [],
    userId: 'user-target',
  } as unknown as BotDocument;
  const storedSession = (): Row => ({
    botId: bot.id,
    brandId: 'brand-target',
    data: {
      context: { source: 'none' },
      platformStates: [],
      status: 'stopped',
    },
    id: 'session-target',
    isDeleted: false,
    organizationId: targetOrganizationId,
    userId: 'user-target',
  });

  function buildService(rows: Row[]) {
    const service = Object.create(
      BotsLivestreamService.prototype,
    ) as BotsLivestreamService;
    Object.assign(service, {
      prisma: { livestreamBotSession: lazySessions(rows) },
    });
    return service;
  }

  it('reads an existing session in the bot organization from another tenant request', async () => {
    const rows = [storedSession()];

    const session = await runWithTenantContext(
      { organizationId: sessionOrganizationId },
      () => buildService(rows).getOrCreateSession(bot),
    );

    expect(session).toMatchObject({
      id: 'session-target',
      organizationId: targetOrganizationId,
      status: 'stopped',
    });
  });

  it('creates a missing session in the bot organization', async () => {
    const rows: Row[] = [];

    await runWithTenantContext({ organizationId: sessionOrganizationId }, () =>
      buildService(rows).getOrCreateSession(bot),
    );

    expect(rows).toEqual([
      expect.objectContaining({
        botId: bot.id,
        isDeleted: false,
        organizationId: targetOrganizationId,
      }),
    ]);
  });

  it('persists a started session in the bot organization and restores the caller context', async () => {
    const rows = [storedSession()];

    const outerContext = await runWithTenantContext(
      { organizationId: sessionOrganizationId },
      async () => {
        await buildService(rows).startSession(bot);
        return getTenantContext();
      },
    );

    expect(rows[0].data).toMatchObject({ status: 'active' });
    expect(outerContext).toEqual({ organizationId: sessionOrganizationId });
  });
});
