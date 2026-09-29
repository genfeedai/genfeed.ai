import { SettingsService } from '@api/collections/settings/services/settings.service';
import { testId, testIds } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

const organizationId = testId('org');
const otherOrganizationId = testId('org', 2);
const settingsId = testId('setting');
const ownWorkflowId = testId('ownworkflow');
const secondOwnWorkflowId = testId('ownworkflow', 2);
const foreignWorkflowId = testId('foreignworkflow');
const secondForeignWorkflowId = testId('foreignworkflow', 2);
const deletedWorkflowId = testId('deletedworkflow');

type WorkflowRow = { id: string; isDeleted: boolean; organizationId: string };

type WorkflowFindManyArgs = {
  where: {
    id: { in: string[] };
    isDeleted: boolean;
    organizationId: string;
  };
};

type SettingUpdateArgs = {
  data: Record<string, unknown>;
  where: { id: string };
};

type LockQuery = { sql: string; values: unknown[] };

type PausedLookup = { markReached: () => void; resumed: Promise<void> };

type FakeTransactionClient = {
  $queryRaw: (query: LockQuery) => Promise<unknown[]>;
  setting: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  workflow: { findMany: (args: WorkflowFindManyArgs) => Promise<unknown> };
};

const baseWorkflowRows: WorkflowRow[] = [
  { id: ownWorkflowId, isDeleted: false, organizationId },
  { id: secondOwnWorkflowId, isDeleted: false, organizationId },
  { id: deletedWorkflowId, isDeleted: true, organizationId },
  {
    id: foreignWorkflowId,
    isDeleted: false,
    organizationId: otherOrganizationId,
  },
  {
    id: secondForeignWorkflowId,
    isDeleted: false,
    organizationId: otherOrganizationId,
  },
];

/** Lets every pending promise continuation run. */
function flushPendingWork(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('SettingsService favorite workflows', () => {
  let workflowRows: WorkflowRow[];
  let storedFavoriteWorkflowIds: string[];
  let hasSettingsRow: boolean;
  let rowLock: Promise<void>;
  let pausedTransactionLookup: PausedLookup | null;
  let workflowFindMany: Mock<
    (args: WorkflowFindManyArgs) => Promise<Array<{ id: string }>>
  >;
  let settingFindFirst: ReturnType<typeof vi.fn>;
  let settingUpdate: ReturnType<typeof vi.fn>;
  let lockQueries: LockQuery[];
  let transaction: ReturnType<typeof vi.fn>;
  let service: SettingsService;

  beforeEach(() => {
    workflowRows = [...baseWorkflowRows];
    storedFavoriteWorkflowIds = [];
    hasSettingsRow = true;
    rowLock = Promise.resolve();
    pausedTransactionLookup = null;
    lockQueries = [];

    // Behaves like the database: rows match on id, organization and
    // soft-delete state exactly as the scoped `where` asks.
    workflowFindMany = vi.fn(async ({ where }: WorkflowFindManyArgs) =>
      workflowRows
        .filter(
          (row) =>
            where.id.in.includes(row.id) &&
            row.organizationId === where.organizationId &&
            row.isDeleted === where.isDeleted,
        )
        .map((row) => ({ id: row.id })),
    );
    settingFindFirst = vi
      .fn()
      .mockImplementation(async () =>
        hasSettingsRow
          ? { favoriteWorkflowIds: [...storedFavoriteWorkflowIds] }
          : null,
      );
    settingUpdate = vi
      .fn()
      .mockImplementation(async ({ data, where }: SettingUpdateArgs) => {
        if (Array.isArray(data.favoriteWorkflowIds)) {
          storedFavoriteWorkflowIds = [...data.favoriteWorkflowIds];
        }
        return {
          ...data,
          favoriteWorkflowIds: [...storedFavoriteWorkflowIds],
          id: where.id,
        };
      });

    // An interactive transaction whose `FOR UPDATE` query holds a row lock
    // until the transaction callback settles, like Postgres does.
    transaction = vi
      .fn()
      .mockImplementation(
        async <T>(
          callback: (tx: FakeTransactionClient) => Promise<T>,
        ): Promise<T> => {
          let releaseLock: () => void = () => undefined;
          const tx: FakeTransactionClient = {
            $queryRaw: async (query) => {
              lockQueries.push(query);
              const previousLock = rowLock;
              rowLock = new Promise<void>((resolve) => {
                releaseLock = resolve;
              });
              await previousLock;
              return [];
            },
            setting: { findFirst: settingFindFirst, update: settingUpdate },
            workflow: {
              findMany: async (args) => {
                const pause = pausedTransactionLookup;
                pausedTransactionLookup = null;
                if (pause) {
                  pause.markReached();
                  await pause.resumed;
                }
                return workflowFindMany(args);
              },
            },
          };
          try {
            return await callback(tx);
          } finally {
            releaseLock();
          }
        },
      );

    service = new SettingsService(
      {
        $transaction: transaction,
        setting: { findFirst: settingFindFirst, update: settingUpdate },
        workflow: { findMany: workflowFindMany },
      } as never,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
    );
  });

  function storeFavorites(favoriteWorkflowIds: string[]): void {
    storedFavoriteWorkflowIds = [...favoriteWorkflowIds];
  }

  function addOwnWorkflows(ids: readonly string[]): void {
    for (const id of ids) {
      workflowRows.push({ id, isDeleted: false, organizationId });
    }
  }

  /**
   * Holds the next workflow lookup made inside a transaction (the merge step,
   * after the row lock is taken) until `resume` is called.
   */
  function pauseNextTransactionLookup(): {
    reached: Promise<void>;
    resume: () => void;
  } {
    let resume: () => void = () => undefined;
    let markReached: () => void = () => undefined;
    const reached = new Promise<void>((resolve) => {
      markReached = resolve;
    });
    const resumed = new Promise<void>((resolve) => {
      resume = resolve;
    });
    pausedTransactionLookup = { markReached, resumed };
    return { reached, resume };
  }

  async function saveFavorites(
    favoriteWorkflowIds: string[],
    activeOrganizationId = organizationId,
  ): Promise<string[]> {
    await service.patchWithFavoriteWorkflowIds(
      settingsId,
      { favoriteWorkflowIds },
      activeOrganizationId,
    );
    return storedFavoriteWorkflowIds;
  }

  describe('assertFavoriteWorkflowIds', () => {
    it('accepts non-deleted workflows of the caller organization', async () => {
      await expect(
        service.assertFavoriteWorkflowIds(
          [ownWorkflowId, secondOwnWorkflowId],
          organizationId,
        ),
      ).resolves.toEqual([ownWorkflowId, secondOwnWorkflowId]);

      expect(workflowFindMany).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          id: { in: [ownWorkflowId, secondOwnWorkflowId] },
          isDeleted: false,
          organizationId,
        },
      });
    });

    it('rejects a workflow from another organization', async () => {
      await expect(
        service.assertFavoriteWorkflowIds(
          [ownWorkflowId, foreignWorkflowId],
          organizationId,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          `favoriteWorkflowIds contains workflows that are not available in this organization: ${foreignWorkflowId}`,
        ),
      );
    });

    it('rejects more than 50 favorites without querying', async () => {
      await expect(
        service.assertFavoriteWorkflowIds(
          testIds('workflow', 51),
          organizationId,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(workflowFindMany).not.toHaveBeenCalled();
    });

    it('rejects duplicate favorites without querying', async () => {
      await expect(
        service.assertFavoriteWorkflowIds(
          [ownWorkflowId, ownWorkflowId],
          organizationId,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(workflowFindMany).not.toHaveBeenCalled();
    });

    it('accepts clearing favorites without querying', async () => {
      await expect(
        service.assertFavoriteWorkflowIds([], organizationId),
      ).resolves.toEqual([]);
      expect(workflowFindMany).not.toHaveBeenCalled();
    });

    it('rejects favorites when no organization is active', async () => {
      await expect(
        service.assertFavoriteWorkflowIds([ownWorkflowId], ''),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(workflowFindMany).not.toHaveBeenCalled();
    });
  });

  describe('withLiveFavoriteWorkflowIds', () => {
    it('leaves settings without favorites untouched', async () => {
      const settings = { id: testId('setting'), theme: 'dark' };

      await expect(
        service.withLiveFavoriteWorkflowIds(settings, organizationId),
      ).resolves.toBe(settings);
      expect(workflowFindMany).not.toHaveBeenCalled();
    });

    it('does not query for an empty favorites list', async () => {
      const settings = { favoriteWorkflowIds: [], id: testId('setting') };

      await expect(
        service.withLiveFavoriteWorkflowIds(settings, organizationId),
      ).resolves.toEqual(settings);
      expect(workflowFindMany).not.toHaveBeenCalled();
    });

    it('exposes no favorites without an active organization', async () => {
      await expect(
        service.withLiveFavoriteWorkflowIds(
          { favoriteWorkflowIds: [ownWorkflowId] },
          '',
        ),
      ).resolves.toEqual({ favoriteWorkflowIds: [] });
      expect(workflowFindMany).not.toHaveBeenCalled();
    });
  });

  describe('patchWithFavoriteWorkflowIds', () => {
    it('locks the non-deleted settings row before reading the stored list', async () => {
      await saveFavorites([ownWorkflowId]);

      expect(lockQueries).toHaveLength(1);
      expect(lockQueries[0].sql).toContain('FOR UPDATE');
      expect(lockQueries[0].sql).toContain('"isDeleted" = false');
      expect(lockQueries[0].values).toEqual([settingsId]);
      expect(settingFindFirst).toHaveBeenCalledWith({
        select: { favoriteWorkflowIds: true },
        where: { id: settingsId, isDeleted: false },
      });
      expect(settingUpdate).toHaveBeenCalledWith({
        data: { favoriteWorkflowIds: [ownWorkflowId] },
        where: { id: settingsId },
      });
    });

    it('rejects a null favorites list before opening a transaction', async () => {
      await expect(
        service.patchWithFavoriteWorkflowIds(
          settingsId,
          { favoriteWorkflowIds: null } as never,
          organizationId,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(transaction).not.toHaveBeenCalled();
    });

    it('returns null without writing when the settings record is gone', async () => {
      hasSettingsRow = false;

      await expect(
        service.patchWithFavoriteWorkflowIds(
          settingsId,
          { favoriteWorkflowIds: [ownWorkflowId] },
          organizationId,
        ),
      ).resolves.toBeNull();
      expect(settingUpdate).not.toHaveBeenCalled();
    });

    it('writes other settings fields in the same locked update', async () => {
      await service.patchWithFavoriteWorkflowIds(
        settingsId,
        { favoriteWorkflowIds: [ownWorkflowId], isMenuCollapsed: true },
        organizationId,
      );

      expect(settingUpdate).toHaveBeenCalledTimes(1);
      expect(settingUpdate).toHaveBeenCalledWith({
        data: { favoriteWorkflowIds: [ownWorkflowId], isMenuCollapsed: true },
        where: { id: settingsId },
      });
    });

    it('drops caller-org favorites whose workflow was deleted', async () => {
      storeFavorites([deletedWorkflowId, foreignWorkflowId]);

      await expect(saveFavorites([ownWorkflowId])).resolves.toEqual([
        foreignWorkflowId,
        ownWorkflowId,
      ]);
    });

    it('bounds the stored list by pruning the oldest other-org favorites', async () => {
      // Unknown to the caller org, so all count as other-org favorites.
      const otherOrganizationIds = testIds('otherorgworkflow', 200);
      const submittedIds = testIds('ownbulkworkflow', 50);
      addOwnWorkflows(submittedIds);
      storeFavorites(otherOrganizationIds);

      const merged = await saveFavorites(submittedIds);

      expect(merged).toHaveLength(200);
      expect(merged).toEqual([
        ...otherOrganizationIds.slice(50),
        ...submittedIds,
      ]);
    });

    it('leaves the favorites column out of the write when no organization is active', async () => {
      storeFavorites([foreignWorkflowId, ownWorkflowId]);

      await service.patchWithFavoriteWorkflowIds(
        settingsId,
        { favoriteWorkflowIds: [], theme: 'dark' },
        '',
      );

      expect(settingUpdate).toHaveBeenCalledWith({
        data: { theme: 'dark' },
        where: { id: settingsId },
      });
      expect(storedFavoriteWorkflowIds).toEqual([
        foreignWorkflowId,
        ownWorkflowId,
      ]);
      expect(workflowFindMany).not.toHaveBeenCalled();
    });

    it('stores only the submitted ids when nothing was saved before', async () => {
      await expect(saveFavorites([ownWorkflowId])).resolves.toEqual([
        ownWorkflowId,
      ]);
      // Validation only: an empty stored list needs no ownership lookup.
      expect(workflowFindMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('concurrent favorites saves', () => {
    it('serializes saves from two organizations so neither update is lost', async () => {
      storeFavorites([ownWorkflowId, foreignWorkflowId]);

      // Org A takes the row lock and stops in the middle of its merge.
      const pause = pauseNextTransactionLookup();
      const saveFromA = saveFavorites([secondOwnWorkflowId], organizationId);
      await pause.reached;

      // Org B saves meanwhile. It must wait for A's lock instead of merging
      // against the list A has not written yet.
      const saveFromB = saveFavorites(
        [secondForeignWorkflowId],
        otherOrganizationId,
      );
      await flushPendingWork();
      expect(settingUpdate).not.toHaveBeenCalled();

      pause.resume();
      await Promise.all([saveFromA, saveFromB]);

      expect(settingUpdate).toHaveBeenCalledTimes(2);
      expect(storedFavoriteWorkflowIds).toEqual([
        secondOwnWorkflowId,
        secondForeignWorkflowId,
      ]);
      await expect(
        service.withLiveFavoriteWorkflowIds(
          { favoriteWorkflowIds: storedFavoriteWorkflowIds },
          organizationId,
        ),
      ).resolves.toEqual({ favoriteWorkflowIds: [secondOwnWorkflowId] });
      await expect(
        service.withLiveFavoriteWorkflowIds(
          { favoriteWorkflowIds: storedFavoriteWorkflowIds },
          otherOrganizationId,
        ),
      ).resolves.toEqual({ favoriteWorkflowIds: [secondForeignWorkflowId] });
    });

    it('does not let a no-organization [] save overwrite a concurrent org save', async () => {
      storeFavorites([ownWorkflowId, foreignWorkflowId]);

      const pause = pauseNextTransactionLookup();
      const saveFromA = saveFavorites([secondOwnWorkflowId], organizationId);
      await pause.reached;

      const saveWithoutOrganization = service.patchWithFavoriteWorkflowIds(
        settingsId,
        { favoriteWorkflowIds: [], isMenuCollapsed: true },
        '',
      );
      await flushPendingWork();
      pause.resume();
      await Promise.all([saveFromA, saveWithoutOrganization]);

      expect(storedFavoriteWorkflowIds).toEqual([
        foreignWorkflowId,
        secondOwnWorkflowId,
      ]);
      expect(settingUpdate).toHaveBeenCalledWith({
        data: { isMenuCollapsed: true },
        where: { id: settingsId },
      });
    });
  });

  describe('favorites across organizations', () => {
    it('keeps org B favorites through an org A write and shows each org only its own', async () => {
      // Saved earlier while the user was active in org B.
      storeFavorites([foreignWorkflowId, secondForeignWorkflowId]);

      // PATCH while active in org A.
      const stored = await saveFavorites([ownWorkflowId]);

      expect(stored).toEqual([
        foreignWorkflowId,
        secondForeignWorkflowId,
        ownWorkflowId,
      ]);
      await expect(
        service.withLiveFavoriteWorkflowIds(
          { favoriteWorkflowIds: stored },
          organizationId,
        ),
      ).resolves.toEqual({ favoriteWorkflowIds: [ownWorkflowId] });
      await expect(
        service.withLiveFavoriteWorkflowIds(
          { favoriteWorkflowIds: stored },
          otherOrganizationId,
        ),
      ).resolves.toEqual({
        favoriteWorkflowIds: [foreignWorkflowId, secondForeignWorkflowId],
      });
    });
  });
});
