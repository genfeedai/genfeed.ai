'use client';

import { IngredientCategory, ViewType } from '@genfeedai/enums';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';

interface UseViewModeProps {
  categoryType: IngredientCategory;
  searchParamsString: string;
  viewParam: string | null;
}

export interface UseViewModeReturn {
  viewMode: ViewType.MASONRY | ViewType.TABLE;
  supportsMasonry: boolean;
  handleViewModeChange: (mode: ViewType) => void;
}

export function useViewMode({
  categoryType,
  searchParamsString,
  viewParam,
}: UseViewModeProps): UseViewModeReturn {
  const pathname = usePathname();
  const router = useRouter();

  const supportsMasonry = categoryType !== IngredientCategory.MUSIC;

  const viewMode = useMemo<ViewType.MASONRY | ViewType.TABLE>(
    () =>
      !supportsMasonry
        ? ViewType.TABLE
        : viewParam === 'table'
          ? ViewType.TABLE
          : ViewType.MASONRY,
    [supportsMasonry, viewParam],
  );

  const handleViewModeChange = useCallback(
    (mode: ViewType) => {
      if (
        (mode !== ViewType.MASONRY && mode !== ViewType.TABLE) ||
        (!supportsMasonry && mode === ViewType.MASONRY) ||
        mode === viewMode
      ) {
        return;
      }

      const params = new URLSearchParams(searchParamsString);
      if (mode === ViewType.MASONRY) {
        params.delete('view');
      } else {
        params.set('view', mode);
      }

      const queryString = params.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [supportsMasonry, viewMode, searchParamsString, pathname, router],
  );

  return { handleViewModeChange, supportsMasonry, viewMode };
}
