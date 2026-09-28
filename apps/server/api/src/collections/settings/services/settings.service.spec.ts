import { SettingsService } from '@api/collections/settings/services/settings.service';
import { testId, testIds } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const workflowRows: WorkflowRow[] = [
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

describe('SettingsService favorite workflows', () => {
  let workflowFindMany: ReturnType<typeof vi.fn>;
  let settingFindFirst: ReturnType<typeof vi.fn>;
  let service: SettingsService;

  beforeEach(() => {
    // Behaves like the database: rows match on id, organization and
    // soft-delete state exactly as the scoped `where` asks.
    workflowFindMany = vi
      .fn()
      .mockImplementation(async ({ where }: WorkflowFindManyArgs) =>
        workflowRows
          .filter(
            (row) =>
              where.id.in.includes(row.id) &&
              row.organizationId === where.organizationId &&
              row.isDeleted === where.isDeleted,
          )
          .map((row) => ({ id: row.id })),
      );
    settingFindFirst = vi.fn().mockResolvedValue(null);
    service = new SettingsService(
      {
        setting: { findFirst: settingFindFirst },
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
    settingFindFirst.mockResolvedValue({ favoriteWorkflowIds });
  }

  describe('assertFavoriteWorkflowIds', () => {
    it('accepts non-deleted workflows of the caller organization', async () => {
      await expect(
        service.assertFavoriteWorkflowIds(
          [ownWorkflowId, secondOwnWorkflowId],
          organizationId,
        ),
      ).resolves.toBeUndefined();

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

    it('rejects a deleted workflow', async () => {
      await expect(
        service.assertFavoriteWorkflowIds([deletedWorkflowId], organizationId),
      ).rejects.toBeInstanceOf(BadRequestException);
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
      ).resolves.toBeUndefined();
      expect(workflowFindMany).not.toHaveBeenCalled();
    });

    it('rejects null instead of an empty list without querying', async () => {
      await expect(
        service.assertFavoriteWorkflowIds(null, organizationId),
      ).rejects.toBeInstanceOf(BadRequestException);
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
    it('drops deleted and foreign favorites and keeps the saved order', async () => {
      const settings = {
        favoriteWorkflowIds: [
          secondOwnWorkflowId,
          deletedWorkflowId,
          ownWorkflowId,
          foreignWorkflowId,
        ],
        id: testId('setting'),
        theme: 'dark',
      };

      await expect(
        service.withLiveFavoriteWorkflowIds(settings, organizationId),
      ).resolves.toEqual({
        favoriteWorkflowIds: [secondOwnWorkflowId, ownWorkflowId],
        id: settings.id,
        theme: 'dark',
      });
    });

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

  describe('mergeFavoriteWorkflowIds', () => {
    it('reads the stored list of the non-deleted settings record', async () => {
      storeFavorites([]);

      await service.mergeFavoriteWorkflowIds(
        settingsId,
        [ownWorkflowId],
        organizationId,
      );

      expect(settingFindFirst).toHaveBeenCalledWith({
        select: { favoriteWorkflowIds: true },
        where: { id: settingsId, isDeleted: false },
      });
    });

    it('keeps other-organization favorites and replaces only the caller org subset', async () => {
      storeFavorites([
        foreignWorkflowId,
        ownWorkflowId,
        secondForeignWorkflowId,
      ]);

      await expect(
        service.mergeFavoriteWorkflowIds(
          settingsId,
          [secondOwnWorkflowId],
          organizationId,
        ),
      ).resolves.toEqual([
        foreignWorkflowId,
        secondForeignWorkflowId,
        secondOwnWorkflowId,
      ]);
    });

    it('checks stored ids against the caller org only, live and deleted', async () => {
      storeFavorites([foreignWorkflowId, ownWorkflowId]);

      await service.mergeFavoriteWorkflowIds(settingsId, [], organizationId);

      for (const isDeleted of [false, true]) {
        expect(workflowFindMany).toHaveBeenCalledWith({
          select: { id: true },
          where: {
            id: { in: [foreignWorkflowId, ownWorkflowId] },
            isDeleted,
            organizationId,
          },
        });
      }
    });

    it('clearing favorites clears only the caller org subset', async () => {
      storeFavorites([ownWorkflowId, foreignWorkflowId, secondOwnWorkflowId]);

      await expect(
        service.mergeFavoriteWorkflowIds(settingsId, [], organizationId),
      ).resolves.toEqual([foreignWorkflowId]);
    });

    it('drops caller-org favorites whose workflow was deleted', async () => {
      storeFavorites([deletedWorkflowId, foreignWorkflowId]);

      await expect(
        service.mergeFavoriteWorkflowIds(
          settingsId,
          [ownWorkflowId],
          organizationId,
        ),
      ).resolves.toEqual([foreignWorkflowId, ownWorkflowId]);
    });

    it('stores the submitted ids in their submitted order', async () => {
      storeFavorites([ownWorkflowId, secondOwnWorkflowId]);

      await expect(
        service.mergeFavoriteWorkflowIds(
          settingsId,
          [secondOwnWorkflowId, ownWorkflowId],
          organizationId,
        ),
      ).resolves.toEqual([secondOwnWorkflowId, ownWorkflowId]);
    });

    it('bounds the stored list by pruning the oldest other-org favorites', async () => {
      // Unknown to the caller org, so all count as other-org favorites.
      const otherOrganizationIds = testIds('otherorgworkflow', 200);
      const submittedIds = testIds('ownbulkworkflow', 50);
      storeFavorites(otherOrganizationIds);

      const merged = await service.mergeFavoriteWorkflowIds(
        settingsId,
        submittedIds,
        organizationId,
      );

      expect(merged).toHaveLength(200);
      expect(merged).toEqual([
        ...otherOrganizationIds.slice(50),
        ...submittedIds,
      ]);
    });

    it('keeps the stored list when no organization is active', async () => {
      storeFavorites([foreignWorkflowId, ownWorkflowId]);

      await expect(
        service.mergeFavoriteWorkflowIds(settingsId, [], ''),
      ).resolves.toEqual([foreignWorkflowId, ownWorkflowId]);
      expect(workflowFindMany).not.toHaveBeenCalled();
    });

    it('stores only the submitted ids when nothing was saved before', async () => {
      await expect(
        service.mergeFavoriteWorkflowIds(
          settingsId,
          [ownWorkflowId],
          organizationId,
        ),
      ).resolves.toEqual([ownWorkflowId]);
      expect(workflowFindMany).not.toHaveBeenCalled();
    });
  });

  describe('favorites across organizations', () => {
    it('keeps org B favorites through an org A write and shows each org only its own', async () => {
      // Saved earlier while the user was active in org B.
      storeFavorites([foreignWorkflowId, secondForeignWorkflowId]);

      // PATCH while active in org A.
      const submittedIds = [ownWorkflowId];
      await service.assertFavoriteWorkflowIds(submittedIds, organizationId);
      const stored = await service.mergeFavoriteWorkflowIds(
        settingsId,
        submittedIds,
        organizationId,
      );

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

    it('rejects an org B id submitted from org A before any merge', async () => {
      await expect(
        service.assertFavoriteWorkflowIds(
          [ownWorkflowId, foreignWorkflowId],
          organizationId,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(settingFindFirst).not.toHaveBeenCalled();
    });
  });
});
