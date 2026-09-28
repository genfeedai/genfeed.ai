import { SettingsService } from '@api/collections/settings/services/settings.service';
import { testId, testIds } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const organizationId = testId('org');
const ownWorkflowId = testId('ownworkflow');
const secondOwnWorkflowId = testId('ownworkflow', 2);
const foreignWorkflowId = testId('foreignworkflow');
const deletedWorkflowId = testId('deletedworkflow');

describe('SettingsService favorite workflows', () => {
  let workflowFindMany: ReturnType<typeof vi.fn>;
  let service: SettingsService;

  beforeEach(() => {
    // The database only ever returns the caller org's non-deleted rows, so
    // foreign and deleted ids are absent from the result.
    workflowFindMany = vi
      .fn()
      .mockImplementation(async (args: { where: { id: { in: string[] } } }) =>
        args.where.id.in
          .filter((id) => id === ownWorkflowId || id === secondOwnWorkflowId)
          .map((id) => ({ id })),
      );
    service = new SettingsService(
      { workflow: { findMany: workflowFindMany } } as never,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
    );
  });

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
});
