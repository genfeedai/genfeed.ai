'use client';

import {
  LIBRARY_ASSET_ROUTES,
  LIBRARY_PLACE_MENU_ITEMS,
} from '@app-config/library-menu-items.config';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  LIBRARY_SHELF_ORDER,
  ModalEnum,
  PageScope,
} from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createLibraryShelfRoute,
  LIBRARY_ASSETS_REFRESH_EVENT,
} from '@genfeedai/contracts/constants';
import type {
  IFolder,
  IIngredient,
  IQueryParams,
} from '@genfeedai/contracts/interfaces';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import { matchesMenuSearchParams } from '@helpers/navigation/menu-route-match.helper';
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
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import {
  normalizeProtectedPathname,
  pickOperatorTaskContextSearchParams,
  withTaskContextHref,
} from '@/lib/navigation/operator-shell';
import {
  createLibraryFolderQuery,
  getLibraryFolderOwnerId,
  getLibraryFolderScope,
} from './library-folder-scope';

/**
 * The folder axis is orthogonal to type and status, so every destination that
 * lists assets keeps `?folder=` when you pick a folder.
 */
const FOLDER_COMPATIBLE_ROUTES = new Set<string>([
  ...LIBRARY_ASSET_ROUTES,
  APP_ROUTES.LIBRARY.RECENT,
  APP_ROUTES.LIBRARY.STARRED,
  APP_ROUTES.LIBRARY.TRASH,
  ...LIBRARY_SHELF_ORDER.map((shelf) => createLibraryShelfRoute(shelf)),
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
  const { brandId, organizationId } = useBrand();
  const { href } = useOrgUrl();
  const notifications = NotificationsService.getInstance();
  const selectedFolderId = searchParams.get('folder');
  const folderScope = getLibraryFolderScope(normalizedPathname);
  const folderOwnerId = getLibraryFolderOwnerId(
    folderScope,
    brandId,
    organizationId,
  );
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
    enabled: Boolean(folderOwnerId),
    queryFn: async () => {
      const service = await getFoldersService();
      const query: IQueryParams = createLibraryFolderQuery(
        folderScope,
        brandId,
        organizationId,
      );

      return service.findAll(query);
    },
    queryKey: ['library-sidebar-folders', folderScope, folderOwnerId],
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
      : href(APP_ROUTES.LIBRARY.ASSETS);
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

  const isMenuItemActive = (item: MenuItemConfig): boolean => {
    const candidatePaths = item.matchPaths ?? (item.href ? [item.href] : []);

    return (
      matchesMenuSearchParams(
        new URLSearchParams(searchParamsString),
        item.matchSearchParams,
      ) &&
      candidatePaths.some((candidate) => {
        const path = candidate.split('?')[0];
        return item.isExactMatch
          ? normalizedPathname === path
          : normalizedPathname === path ||
              normalizedPathname.startsWith(`${path}/`);
      })
    );
  };

  const renderMenuItem = (item: MenuItemConfig) => {
    const [targetPath, targetSearch = ''] = (
      item.href ?? APP_ROUTES.LIBRARY.ASSETS
    ).split('?');
    const params = new URLSearchParams(
      targetPath === APP_ROUTES.LIBRARY.REFERENCES ? '' : searchParamsString,
    );
    for (const key of ['place', 'shelf', 'page']) params.delete(key);
    new URLSearchParams(targetSearch).forEach((value, key) => {
      params.set(key, value);
    });
    const scopedHref = withTaskContextHref(
      `${href(targetPath)}${params.size ? `?${params.toString()}` : ''}`,
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
  };

  return (
    <>
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 scrollbar-thin">
          <ul className="flex flex-col gap-px">
            {LIBRARY_PLACE_MENU_ITEMS.map(renderMenuItem)}
          </ul>

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
        brandId={
          folderScope === PageScope.BRAND ? (brandId ?? undefined) : undefined
        }
        item={null}
        onConfirm={(shouldRefreshAssets) => {
          void refetchFolders();
          if (shouldRefreshAssets) {
            dispatchLibraryAssetsRefresh();
          }
        }}
        scope={folderScope}
      />
    </>
  );
}
