'use client';

import {
  LIBRARY_ASSET_ROUTES,
  LIBRARY_MENU_ITEMS,
} from '@app-config/library-menu-items.config';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { APP_ROUTES, LIBRARY_ASSETS_REFRESH_EVENT } from '@genfeedai/constants';
import { ModalEnum, PageScope } from '@genfeedai/enums';
import type { IFolder, IIngredient, IQueryParams } from '@genfeedai/interfaces';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { FoldersService } from '@services/content/folders.service';
import { IngredientsService } from '@services/content/ingredients.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import FoldersSidebar from '@ui/folders/sidebar/FoldersSidebar';
import { LazyModalFolder } from '@ui/lazy/modal/LazyModal';
import MenuItem from '@ui/menus/item/MenuItem';
import SidebarActionTrigger from '@ui/menus/sidebar-action-trigger/SidebarActionTrigger';
import SidebarSearchTrigger from '@ui/menus/sidebar-search-trigger/SidebarSearchTrigger';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { HiPlus } from 'react-icons/hi2';
import {
  normalizeProtectedPathname,
  pickOperatorTaskContextSearchParams,
  withTaskContextHref,
} from '@/lib/navigation/operator-shell';
import { dispatchOpenTaskComposer } from '@/lib/workspace/task-composer-events';
import { useCommandPaletteStore } from '@/store/commandPaletteStore';

const FOLDER_COMPATIBLE_ROUTES = new Set<string>([
  APP_ROUTES.LIBRARY.AVATARS,
  APP_ROUTES.LIBRARY.GIFS,
  APP_ROUTES.LIBRARY.IMAGES,
  APP_ROUTES.LIBRARY.MUSIC,
  APP_ROUTES.LIBRARY.VIDEOS,
]);

function dispatchLibraryAssetsRefresh(): void {
  window.dispatchEvent(new Event(LIBRARY_ASSETS_REFRESH_EVENT));
}

export default function LibrarySidebarNav() {
  const pathname = usePathname();
  const normalizedPathname = normalizeProtectedPathname(pathname);
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const { replace } = useRouter();
  const { brandId } = useBrand();
  const { href } = useOrgUrl();
  const notifications = NotificationsService.getInstance();
  const selectedFolderId = searchParams.get('folder');
  const taskContextSearchParams = useMemo(
    () =>
      pickOperatorTaskContextSearchParams(
        new URLSearchParams(searchParamsString),
      ),
    [searchParamsString],
  );

  const getFoldersService = useAuthedService((token: string) =>
    FoldersService.getInstance(token),
  );
  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  const {
    data: folders = [],
    isLoading: isLoadingFolders,
    refetch: refetchFolders,
  } = useQuery<IFolder[]>({
    enabled: Boolean(brandId),
    queryFn: async () => {
      const service = await getFoldersService();
      const query: IQueryParams = {
        brand: brandId ?? undefined,
        isActive: true,
        pagination: false,
      };

      return service.findAll(query);
    },
    queryKey: ['library-sidebar-folders', brandId],
  });

  const handleSelectFolder = (folder: IFolder | null) => {
    const nextSearchParams = new URLSearchParams(searchParamsString);
    nextSearchParams.delete('page');

    if (folder) {
      nextSearchParams.set('folder', folder.id);
    } else {
      nextSearchParams.delete('folder');
    }

    const currentRouteSupportsFolders =
      FOLDER_COMPATIBLE_ROUTES.has(normalizedPathname);
    if (!currentRouteSupportsFolders) {
      nextSearchParams.delete('format');
      nextSearchParams.delete('provider');
      nextSearchParams.delete('sort');
      nextSearchParams.delete('status');
    }

    const nextPath = currentRouteSupportsFolders
      ? pathname
      : href(APP_ROUTES.LIBRARY.VIDEOS);
    const nextQuery = nextSearchParams.toString();

    replace(`${nextPath}${nextQuery ? `?${nextQuery}` : ''}`, {
      scroll: false,
    });
  };

  const handleFolderDrop = async (
    ingredient: IIngredient,
    folder: IFolder | null,
  ) => {
    try {
      const service = await getIngredientsService();
      await service.patch(ingredient.id, {
        folder: folder?.id,
      });
      notifications.success(
        folder ? `Moved to ${folder.label}` : 'Moved to All assets',
      );
      dispatchLibraryAssetsRefresh();
    } catch (error) {
      logger.error('Failed to move Library asset', error);
      notifications.error('Failed to move asset');
    }
  };

  const isMenuItemActive = (item: (typeof LIBRARY_MENU_ITEMS)[number]) => {
    if (item.label === 'Assets') {
      return LIBRARY_ASSET_ROUTES.includes(
        normalizedPathname as (typeof LIBRARY_ASSET_ROUTES)[number],
      );
    }

    return normalizedPathname === item.href;
  };

  return (
    <>
      <div className="flex h-full min-h-0 flex-col">
        <div className="px-3 pt-2">
          <SidebarActionTrigger
            ariaLabel="Open new task modal"
            icon={<HiPlus className="size-4 flex-shrink-0" />}
            label="New Task"
            onClick={dispatchOpenTaskComposer}
            shortcut="⌘⇧N"
          />
          <SidebarSearchTrigger
            onClick={() => useCommandPaletteStore.getState().open()}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 scrollbar-thin">
          <div className="mt-2">
            <div className="p-1 text-[10px] font-bold uppercase tracking-[0.15em] text-foreground/30">
              Library
            </div>
            <ul className="flex flex-col gap-px">
              {LIBRARY_MENU_ITEMS.map((item) => {
                const scopedHref = withTaskContextHref(
                  href(item.href ?? APP_ROUTES.LIBRARY.OVERVIEW),
                  taskContextSearchParams,
                );

                return (
                  <MenuItem
                    key={item.label}
                    href={scopedHref}
                    isActive={isMenuItemActive(item)}
                    label={item.label}
                    outline={item.outline}
                    solid={item.solid}
                    variant="icon"
                  />
                );
              })}
            </ul>
          </div>

          <FoldersSidebar
            folders={folders}
            isLoading={isLoadingFolders}
            onCreateFolder={() => openModal(ModalEnum.FOLDER)}
            onDropIngredient={(ingredient, folder) => {
              void handleFolderDrop(ingredient, folder);
            }}
            onSelectFolder={handleSelectFolder}
            selectedFolderId={selectedFolderId}
            variant="navigation"
          />
        </div>
      </div>

      <LazyModalFolder
        brandId={brandId ?? undefined}
        item={null}
        onConfirm={(shouldRefreshAssets) => {
          void refetchFolders();
          if (shouldRefreshAssets) {
            dispatchLibraryAssetsRefresh();
          }
        }}
        scope={PageScope.BRAND}
      />
    </>
  );
}
