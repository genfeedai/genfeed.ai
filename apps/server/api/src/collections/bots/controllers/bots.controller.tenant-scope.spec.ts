import { BotsController } from '@api/collections/bots/controllers/bots.controller';
import {
  adminUser,
  lazyTenantResult,
  memberUser,
  sessionOrganizationId,
  targetBrandId,
  targetOrganizationId,
  tenantReadRequest,
} from '@api-test/helpers/tenant-read.fixture';
import { BotLivestreamSessionStatus, BotPlatform } from '@genfeedai/contracts';
import {
  getTenantContext,
  runWithTenantContext,
} from '@libs/prisma/tenant-context';

describe('Authorized bot livestream operations (#6176)', () => {
  const bot = {
    id: 'bot-target',
    organizationId: targetOrganizationId,
    userId: 'owner',
    brandId: targetBrandId,
  };
  function setup() {
    // Tenant context observed each time a session operation actually executes.
    const executions: ReturnType<typeof getTenantContext>[] = [];
    // Every bot lookup's where clause, to check the tenant filter.
    const lookups: Record<string, unknown>[] = [];
    const read = () =>
      lazyTenantResult(
        {
          id: 'session-target',
          organizationId: targetOrganizationId,
          status: 'stopped',
        },
        (context) => executions.push(context),
      );
    const findOne = async (where: Record<string, unknown>) => {
      lookups.push(where);
      return where.organizationId === sessionOrganizationId ? null : bot;
    };
    const controller = Object.create(
      BotsController.prototype,
    ) as BotsController;
    Object.assign(controller, {
      botsService: { findOne },
      entityName: 'Bot',
      optimizedPopulateFields: [],
      botsLivestreamService: {
        getOrCreateSession: read,
        stopSession: read,
        sendNow: read,
        setManualOverride: read,
        ingestTranscriptChunk: read,
      },
      botsRestreamChatService: { ingestChatActions: read },
    });
    return { controller, executions, lookups };
  }
  describe.each([
    'get',
    'patch',
    'send',
    'override',
    'transcript',
    'restream',
  ] as const)('%s', (route) => {
    function invoke(controller: BotsController, user = adminUser) {
      const request = tenantReadRequest(user);
      switch (route) {
        case 'get':
          return controller.getLivestreamSession(request, user, bot.id);
        case 'patch':
          return controller.patchLivestreamSession(request, user, bot.id, {
            status: BotLivestreamSessionStatus.STOPPED,
          });
        case 'send':
          return controller.sendLivestreamMessageNow(request, user, bot.id, {
            platform: BotPlatform.YOUTUBE,
            message: 'Hello',
          });
        case 'override':
          return controller.updateLivestreamOverride(request, user, bot.id, {});
        case 'transcript':
          return controller.ingestLivestreamTranscript(request, user, bot.id, {
            text: 'Hello',
          });
        case 'restream':
          return controller.ingestRestreamChat(user, bot.id, { actions: [] });
      }
    }
    it('runs the session operation in the authorized bot organization', async () => {
      const { controller, executions } = setup();
      await runWithTenantContext(
        { organizationId: sessionOrganizationId },
        async () => {
          await invoke(controller);
          expect(getTenantContext()).toEqual({
            organizationId: sessionOrganizationId,
          });
        },
      );
      expect(executions).toEqual([{ organizationId: targetOrganizationId }]);
    });
    it('keeps foreign bots inaccessible to members', async () => {
      const { controller, executions, lookups } = setup();
      await expect(invoke(controller, memberUser)).rejects.toMatchObject({
        status: 404,
      });
      expect(lookups).toEqual([
        expect.objectContaining({
          organizationId: sessionOrganizationId,
          isDeleted: false,
        }),
      ]);
      expect(executions).toEqual([]);
    });
  });
});
