'use client';

import {
  LIBRARY_ASSET_ROUTES,
  LIBRARY_PLACE_MENU_ITEMS,
  LIBRARY_SHELF_MENU_ITEMS,
  LIBRARY_TAIL_MENU_ITEMS,
} from '@app-config/library-menu-items.config';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  APP_ROUTES,
  createLibraryShelfRoute,
  LIBRARY_ASSETS_REFRESH_EVENT,
} from '@genfeedai/constants';
import { LibraryShelf, ModalEnum, PageScope } from '@genfeedai/enums';
import type { IFolder, IIngredient, IQueryParams } from '@genfeedai/interfaces';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useLibrarySummary } from '@hooks/data/library/use-library-summary';
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
import { Plus } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import {
  normalizeProtectedPathname,
  pickOperatorTaskContextSearchParams,
  withTaskContextHref,
} from '@/lib/navigation/operator-shell';
import { dispatchOpenTaskComposer } from '@/lib/workspace/task-composer-events';
import { useCommandPaletteStore } from '@/store/commandPaletteStore';
import {
  createLibraryFolderQuery,
  getLibraryFolderOwnerId,
  getLibraryFolderScope,
} from './library-folder-scope';
import { formatStorageBytes } from './library-storage.util';

/**
 * The folder axis is orthogonal to type and shelf, so every destination that
 * lists assets keeps `?folder=` when you pick a folder. Only Mood board sits
 * outside the asset table.
 */
const FOLDER_COMPATIBLE_ROUTES = new Set<string>([
  ...LIBRARY_ASSET_ROUTES,
  APP_ROUTES.LIBRARY.RECENT,
  APP_ROUTES.LIBRARY.STARRED,
  APP_ROUTES.LIBRARY.TRASH,
  ...LIBRARY_SHELF_MENU_ITEMS.map((item) => item.href ?? ''),
]);

/** Sidebar rows resolve their shelf by route so counts cannot drift off label text. */
const SHELF_BY_ROUTE = new Map<string, LibraryShelf>(
  Object.values(LibraryShelf).map((shelf) => [
    createLibraryShelfRoute(shelf),
    shelf,
  ]),
);

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
  const translate = useTranslations('pages.library.sidebar');
  const notifications = NotificationsService.getInstance();
  const selectedFolderId = searchParams.get('folder');
  const folderScope = getLibraryFolderScope(normalizedPathname);
  const folderOwnerId = getLibraryFolderOwnerId(
    folderScope,
    brandId,
    organizationId,
  );
  const { summary } = useLibrarySummary();
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

    return candidatePaths.some((candidate) =>
      item.isExactMatch
        ? normalizedPathname === candidate
        : normalizedPathname === candidate ||
          normalizedPathname.startsWith(`${candidate}/`),
    );
  };

  const getShelfCount = (item: MenuItemConfig): number | undefined => {
    const shelf = item.href ? SHELF_BY_ROUTE.get(item.href) : undefined;

    return shelf ? summary?.byShelf?.[shelf] : undefined;
  };

  /**
   * Generating is the one shelf that empties on its own, so an idle library
   * should not carry a permanent zero row for it. Every other shelf keeps its
   * place — a stable list is worth more than hiding an empty count.
   */
  const isShelfVisible = (item: MenuItemConfig): boolean => {
    if (item.href !== createLibraryShelfRoute(LibraryShelf.GENERATING)) {
      return true;
    }

    return (getShelfCount(item) ?? 0) > 0;
  };

  const renderMenuItem = (item: MenuItemConfig) => {
    const scopedHref = withTaskContextHref(
      href(item.href ?? APP_ROUTES.LIBRARY.ASSETS),
      taskContextSearchParams,
    );
    const isGenerating =
      item.href === createLibraryShelfRoute(LibraryShelf.GENERATING);

    return (
      <MenuItem
        key={item.label}
        count={getShelfCount(item)}
        href={scopedHref}
        isActive={isMenuItemActive(item)}
        isPulsing={isGenerating}
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
        <div className="flex flex-col gap-px px-3 pt-2">
          <SidebarActionTrigger
            ariaLabel="Open new task modal"
            icon={<Plus className="size-4 flex-shrink-0" />}
            label="New Task"
            onClick={dispatchOpenTaskComposer}
            shortcut="⌘⇧N"
          />
          <SidebarSearchTrigger
            onClick={() => useCommandPaletteStore.getState().open()}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 scrollbar-thin">
          <ul className="mt-2 flex flex-col gap-px">
            {LIBRARY_PLACE_MENU_ITEMS.map(renderMenuItem)}
          </ul>

          <div className="mt-4">
            <div className="p-1 text-2xs font-bold uppercase tracking-[0.15em] text-foreground/30">
              {translate('shelvesGroup')}
            </div>
            <ul className="flex flex-col gap-px">
              {LIBRARY_SHELF_MENU_ITEMS.filter(isShelfVisible).map(
                renderMenuItem,
              )}
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

          <div className="mt-4">
            <ul className="flex flex-col gap-px">
              {LIBRARY_TAIL_MENU_ITEMS.map(renderMenuItem)}
            </ul>
          </div>
        </div>

        {summary ? (
          <div className="px-4 py-3">
            <div className="text-2xs font-bold uppercase tracking-[0.15em] text-foreground/30">
              {translate('storageLabel')}
            </div>
            <div className="mt-0.5 text-sm font-medium tabular-nums text-foreground/72">
              {formatStorageBytes(summary.storageBytes)}
            </div>
          </div>
        ) : null}
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
