'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import type { IMoodBoard, IMoodBoardLayoutItem } from '@genfeedai/interfaces';
import { MoodBoardsService } from '@genfeedai/services/content/mood-boards.service';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

export function useMoodBoard() {
  const { isSignedIn } = useAuthIdentity();
  const { brandId } = useBrand();
  const queryClient = useQueryClient();

  const getMoodBoardsService = useAuthedService((token: string) =>
    MoodBoardsService.getInstance(token),
  );

  const {
    data: board,
    isLoading,
    error,
    refetch,
  } = useQuery<IMoodBoard | undefined>({
    queryKey: ['mood-board', brandId],
    queryFn: async () => {
      if (!brandId) {
        return undefined;
      }
      const service = await getMoodBoardsService();
      return service.getByBrand(brandId) as Promise<IMoodBoard>;
    },
    enabled: !!isSignedIn && !!brandId,
  });

  const save = useCallback(
    async (layout: IMoodBoardLayoutItem[]): Promise<void> => {
      if (!board?.id) {
        return;
      }
      const service = await getMoodBoardsService();
      const updated = await service.patch(board.id, { layout });
      if (updated) {
        await queryClient.invalidateQueries({
          queryKey: ['mood-board', brandId],
        });
      }
    },
    [board?.id, brandId, getMoodBoardsService, queryClient],
  );

  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    board,
    error,
    isLoading,
    refresh,
    save,
  };
}
