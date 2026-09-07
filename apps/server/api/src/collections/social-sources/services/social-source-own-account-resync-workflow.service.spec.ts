vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import {
  SOCIAL_OWN_ACCOUNT_RESYNC_MAX_SOURCES_PER_RUN,
  SocialSourceOwnAccountResyncWorkflowService,
} from '@api/collections/social-sources/services/social-source-own-account-resync-workflow.service';
import { SOCIAL_SOURCE_OWN_ACCOUNT_RESYNC_ACTION_IDS } from '@api/collections/social-sources/services/social-source-own-account-resync-workflow-definition';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

describe('SocialSourceOwnAccountResyncWorkflowService', () => {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
  const queue = { queueSystemWorkflow: vi.fn() };
  const runner = {
    registerAction: vi.fn(),
    registerWorkflow: vi.fn(),
  };
  const socialSource = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  };
  const prisma = { socialSource } as unknown as PrismaService;
  const socialSourcesService = { resyncOwnAccount: vi.fn() };

  let service: SocialSourceOwnAccountResyncWorkflowService;

  beforeEach(() => {
    vi.clearAllMocks();
    queue.queueSystemWorkflow.mockResolvedValue('job-1');
    service = new SocialSourceOwnAccountResyncWorkflowService(
      prisma,
      socialSourcesService as never,
      queue as never,
      runner as never,
      logger,
    );
  });

  describe('discoverDueSources', () => {
    it('bounds the query to the configured max sources per run', async () => {
      socialSource.findMany.mockResolvedValue([]);

      await service.discoverDueSources();

      expect(socialSource.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: SOCIAL_OWN_ACCOUNT_RESYNC_MAX_SOURCES_PER_RUN,
          where: expect.objectContaining({
            credentialId: { not: null },
            isActive: true,
            isDeleted: false,
            sourceType: 'own-account',
          }),
        }),
      );
    });

    it('maps discovered rows into resync items', async () => {
      socialSource.findMany.mockResolvedValue([
        {
          brandId: 'brand-1',
          id: 'source-1',
          organizationId: 'org-1',
          userId: 'user-1',
        },
        {
          brandId: 'brand-2',
          id: 'source-2',
          organizationId: 'org-2',
          userId: 'user-2',
        },
      ]);

      const result = await service.discoverDueSources();

      expect(result).toEqual({
        items: [
          {
            brandId: 'brand-1',
            organizationId: 'org-1',
            sourceId: 'source-1',
            userId: 'user-1',
          },
          {
            brandId: 'brand-2',
            organizationId: 'org-2',
            sourceId: 'source-2',
            userId: 'user-2',
          },
        ],
      });
    });
  });

  describe('registered run action', () => {
    function runAction(input: Record<string, unknown>) {
      service.onModuleInit();
      const call = runner.registerAction.mock.calls.find(
        ([actionId]) =>
          actionId === SOCIAL_SOURCE_OWN_ACCOUNT_RESYNC_ACTION_IDS.RUN,
      );
      if (!call) {
        throw new Error('Resync run action was not registered');
      }
      const handler = call[1] as (params: {
        input: Record<string, unknown>;
      }) => Promise<unknown>;
      return handler({ input });
    }

    it('resyncs one source through SocialSourcesService', async () => {
      socialSource.findFirst.mockResolvedValue({
        brandId: 'brand-1',
        credentialId: 'credential-1',
        id: 'source-1',
        organizationId: 'org-1',
      });
      socialSourcesService.resyncOwnAccount.mockResolvedValue({
        count: 3,
        posts: [],
        provider: 'app-bearer',
        rejectedCount: 0,
      });

      const result = await runAction({
        request: {
          brandId: 'brand-1',
          organizationId: 'org-1',
          sourceId: 'source-1',
          userId: 'user-1',
        },
      });

      expect(socialSourcesService.resyncOwnAccount).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'source-1' }),
      );
      expect(result).toEqual({
        importedCount: 3,
        provider: 'app-bearer',
        rejectedCount: 0,
        sourceId: 'source-1',
      });
    });

    it('lets one source failure surface without touching another source', async () => {
      socialSource.findFirst
        .mockResolvedValueOnce({
          brandId: 'brand-1',
          credentialId: 'credential-1',
          id: 'source-1',
          organizationId: 'org-1',
        })
        .mockResolvedValueOnce({
          brandId: 'brand-2',
          credentialId: 'credential-2',
          id: 'source-2',
          organizationId: 'org-2',
        });
      socialSourcesService.resyncOwnAccount
        .mockRejectedValueOnce(new Error('provider unavailable'))
        .mockResolvedValueOnce({
          count: 1,
          posts: [],
          provider: 'apify',
          rejectedCount: 0,
        });

      const failing = runAction({
        request: {
          brandId: 'brand-1',
          organizationId: 'org-1',
          sourceId: 'source-1',
          userId: 'user-1',
        },
      });
      await expect(failing).rejects.toThrow('provider unavailable');

      const succeeding = await runAction({
        request: {
          brandId: 'brand-2',
          organizationId: 'org-2',
          sourceId: 'source-2',
          userId: 'user-2',
        },
      });
      expect(succeeding).toEqual({
        importedCount: 1,
        provider: 'apify',
        rejectedCount: 0,
        sourceId: 'source-2',
      });
    });

    it('throws when the source is no longer available', async () => {
      socialSource.findFirst.mockResolvedValue(null);

      await expect(
        runAction({
          request: {
            brandId: 'brand-1',
            organizationId: 'org-1',
            sourceId: 'missing-source',
            userId: 'user-1',
          },
        }),
      ).rejects.toThrow(
        'Own-account source missing-source is not available for resync',
      );
      expect(socialSourcesService.resyncOwnAccount).not.toHaveBeenCalled();
    });
  });

  describe('enqueueSweep', () => {
    it('queues the sweep workflow with a deduped, hour-bucketed job id', async () => {
      const now = new Date('2026-09-07T12:34:00Z');

      await service.enqueueSweep(now);

      expect(queue.queueSystemWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          canonicalId: 'social-source.own-account-resync',
          trigger: 'scheduled',
        }),
        expect.stringContaining('social-source-own-account-resync-'),
        expect.objectContaining({ replaceTerminalJob: true }),
      );
    });
  });
});
