'use client';

import { IngredientStatus } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { IngredientsService } from '@services/content/ingredients.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useCallback, useMemo, useState } from 'react';

interface UseTableSelectionProps {
  findAllAssets: (
    page: number,
    isLoadMore: boolean,
    isRefreshing?: boolean,
  ) => Promise<void>;
}

export interface UseTableSelectionReturn {
  tableSelectedIds: string[];
  setTableSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  isBulkUpdating: boolean;
  handleClearSelection: () => void;
  handleBulkDelete: () => void;
  handleBulkStatusChange: (newStatus: IngredientStatus) => Promise<void>;
}

export function useTableSelection({
  findAllAssets,
}: UseTableSelectionProps): UseTableSelectionReturn {
  const [tableSelectedIds, setTableSelectedIds] = useState<string[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  const { openConfirm } = useConfirmModal();

  const handleClearSelection = useCallback(() => setTableSelectedIds([]), []);

  const confirmBulkDelete = useCallback(async () => {
    if (tableSelectedIds.length === 0) {
      return;
    }

    setIsBulkUpdating(true);
    try {
      const service = await getIngredientsService();
      const data = await service.bulkDelete({
        ids: tableSelectedIds,
        type: 'ingredients-delete',
      });

      if (data.deleted && data.deleted.length > 0) {
        notificationsService.success(
          `Successfully deleted ${data.deleted.length} item(s)`,
        );
        setTableSelectedIds([]);
        await findAllAssets(1, false, true);
      }

      if (data.failed && data.failed.length > 0) {
        notificationsService.error(
          `Failed to delete ${data.failed.length} item(s)`,
        );
      }
    } catch (error) {
      logger.error('Bulk delete failed', error);
      notificationsService.error('Failed to delete selected items');
    } finally {
      setIsBulkUpdating(false);
    }
  }, [
    tableSelectedIds,
    getIngredientsService,
    findAllAssets,
    notificationsService,
  ]);

  const handleBulkDelete = useCallback(() => {
    if (tableSelectedIds.length === 0) {
      return;
    }

    openConfirm({
      confirmLabel: 'Delete',
      isError: true,
      label: `Delete ${tableSelectedIds.length} Item${tableSelectedIds.length !== 1 ? 's' : ''}`,
      message: `Are you sure you want to delete ${tableSelectedIds.length} selected item${tableSelectedIds.length !== 1 ? 's' : ''}? This action cannot be undone.`,
      onConfirm: confirmBulkDelete,
    });
  }, [tableSelectedIds.length, openConfirm, confirmBulkDelete]);

  const handleBulkStatusChange = useCallback(
    async (newStatus: IngredientStatus) => {
      if (tableSelectedIds.length === 0) {
        return;
      }

      setIsBulkUpdating(true);
      try {
        const service = await getIngredientsService();

        const results = await Promise.allSettled(
          tableSelectedIds.map((id) =>
            service.patch(id, { status: newStatus }),
          ),
        );

        const succeeded = results.filter(
          (r) => r.status === 'fulfilled',
        ).length;
        const failed = results.filter((r) => r.status === 'rejected').length;

        if (failed === 0) {
          notificationsService.success(
            `Successfully updated ${succeeded} item(s)`,
          );
        } else if (succeeded === 0) {
          notificationsService.error(
            'Failed to update status for selected items',
          );
        } else {
          notificationsService.warning(
            `Updated ${succeeded} item(s), ${failed} failed`,
          );
        }

        setTableSelectedIds([]);
        await findAllAssets(1, false, true);
      } catch (error) {
        logger.error('Bulk status update failed', error);
        notificationsService.error(
          'Failed to update status for selected items',
        );
      } finally {
        setIsBulkUpdating(false);
      }
    },
    [
      tableSelectedIds,
      getIngredientsService,
      findAllAssets,
      notificationsService,
    ],
  );

  return {
    handleBulkDelete,
    handleBulkStatusChange,
    handleClearSelection,
    isBulkUpdating,
    setTableSelectedIds,
    tableSelectedIds,
  };
}
