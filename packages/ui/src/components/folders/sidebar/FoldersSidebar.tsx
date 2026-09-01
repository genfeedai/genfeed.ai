'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  FolderTreeNode,
  IFolder,
  IIngredient,
} from '@genfeedai/interfaces';
import type { FoldersSidebarProps } from '@genfeedai/props/content/folders-sidebar.props';
import DropZoneFolder from '@ui/drag-drop/zone-folder/DropZoneFolder';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Button } from '@ui/primitives/button';
import { ChevronRight, Folder, Plus } from 'lucide-react';
import { memo, useMemo, useState } from 'react';

import { buildFolderTree, getFolderAncestorIds } from './folder-tree.util';

/** Indent per nesting level, in pixels, applied to the row rather than the label. */
const FOLDER_DEPTH_INDENT = 14;

const FOLDER_ROW_CLASS_NAME =
  'group flex h-8 w-full min-w-0 flex-1 !rounded !border-transparent !px-2.5 !py-1.5 text-left text-foreground/72 hover:!bg-foreground/[0.06] hover:text-foreground';

function FoldersSidebar({
  folders,
  selectedFolderId,
  onSelectFolder,
  onDropIngredient,
  onCreateFolder,
  isLoading = false,
  variant = 'panel',
}: FoldersSidebarProps) {
  const folderTree = useMemo(() => buildFolderTree(folders), [folders]);
  /**
   * The branch holding the current folder is always open — you cannot be
   * looking at a folder the sidebar has hidden. Everything else starts closed,
   * so a deep tree opens on demand rather than flooding the rail.
   */
  const selectedAncestorIds = useMemo(
    () => getFolderAncestorIds(folders, selectedFolderId),
    [folders, selectedFolderId],
  );
  const [openFolderIds, setOpenFolderIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  const getIsFolderOpen = (folderId: string): boolean =>
    openFolderIds.has(folderId) || selectedAncestorIds.has(folderId);

  const toggleFolder = (folderId: string): void => {
    setOpenFolderIds((current) => {
      const next = new Set(current);

      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }

      return next;
    });
  };

  const renderFolderRow = (folder: IFolder | null, hasDisclosure = false) => {
    const isSelected = folder
      ? selectedFolderId === folder.id
      : !selectedFolderId;

    return (
      <DropZoneFolder
        folder={folder}
        onDrop={(ingredient: IIngredient) =>
          onDropIngredient?.(ingredient, folder)
        }
        onClick={() => onSelectFolder?.(folder)}
        className={cn(
          FOLDER_ROW_CLASS_NAME,
          isSelected && '!bg-foreground/[0.06] text-foreground',
        )}
        isSelected={isSelected}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              'flex size-5 shrink-0 items-center justify-center transition-colors duration-200',
              isSelected
                ? 'text-foreground'
                : 'text-foreground/42 group-hover:text-foreground/78',
            )}
          >
            {hasDisclosure ? null : <Folder className="size-4" />}
          </span>
          <span
            className={cn(
              'truncate text-sm font-medium tracking-[-0.01em]',
              isSelected && 'font-semibold',
            )}
          >
            {folder ? folder.label : 'All assets'}
          </span>
        </div>
      </DropZoneFolder>
    );
  };

  const renderFolderNode = (node: FolderTreeNode) => {
    const { children, depth, folder } = node;
    const hasChildren = children.length > 0;
    const isOpen = getIsFolderOpen(folder.id);

    return (
      <div className="flex flex-col gap-px" key={folder.id}>
        <div
          className="relative flex items-center"
          style={{ paddingLeft: depth * FOLDER_DEPTH_INDENT }}
        >
          {hasChildren ? (
            <Button
              aria-expanded={isOpen}
              ariaLabel={`${isOpen ? 'Collapse' : 'Expand'} ${folder.label}`}
              className="absolute top-1.5 z-10 size-5 shrink-0 p-0 text-foreground/42 hover:bg-foreground/[0.06] hover:text-foreground"
              onClick={() => toggleFolder(folder.id)}
              size={ButtonSize.ICON}
              textTransform="none"
              variant={ButtonVariant.GHOST}
              withWrapper={false}
              style={{ left: depth * FOLDER_DEPTH_INDENT + 10 }}
            >
              <ChevronRight
                aria-hidden
                className={cn(
                  'size-3.5 transition-transform duration-150',
                  isOpen && 'rotate-90',
                )}
              />
            </Button>
          ) : null}
          {renderFolderRow(folder, hasChildren)}
        </div>

        {hasChildren && isOpen ? children.map(renderFolderNode) : null}
      </div>
    );
  };

  if (variant === 'navigation') {
    return (
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between gap-1 px-1">
          <span className="text-2xs font-bold uppercase tracking-[0.15em] text-foreground/30">
            Folders
          </span>
          {onCreateFolder ? (
            <Button
              ariaLabel="New folder"
              className="size-6 shrink-0 p-0 text-foreground/42 hover:bg-foreground/[0.06] hover:text-foreground"
              onClick={onCreateFolder}
              size={ButtonSize.ICON}
              textTransform="none"
              // Right — sidebar is a left rail; bottom dumps the tooltip onto
              // the folder list and collides with "All assets".
              tooltip="New folder"
              tooltipPosition="right"
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            >
              <Plus className="size-3.5" aria-hidden />
            </Button>
          ) : null}
        </div>

        <div className="flex flex-col gap-px">
          {renderFolderRow(null)}

          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Spinner size={ComponentSize.SM} />
            </div>
          ) : (
            folderTree.map(renderFolderNode)
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3">
      <div className="px-1">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Folders
          </div>
          <div className="mt-1 text-sm font-medium text-foreground">
            Organize reusable assets
          </div>
        </div>
      </div>

      {onCreateFolder && (
        <Button
          variant={ButtonVariant.SECONDARY}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg px-3"
          onClick={onCreateFolder}
          textTransform="none"
          withWrapper={false}
        >
          <Plus className="size-4 shrink-0" aria-hidden />
          New folder
        </Button>
      )}

      <DropZoneFolder
        folder={null}
        onDrop={(ingredient: IIngredient) =>
          onDropIngredient?.(ingredient, null)
        }
        onClick={() => onSelectFolder?.(null)}
        className={cn(
          'mb-2 flex h-10 w-full items-center border-border bg-tertiary px-3 py-0 text-muted-foreground hover:border-border-strong hover:bg-hover',
          !selectedFolderId && 'border-border-strong bg-hover text-foreground',
        )}
        isSelected={!selectedFolderId}
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner size={ComponentSize.MD} />
        </div>
      ) : (
        folders.map((folder) => (
          <DropZoneFolder
            key={folder.id}
            folder={folder}
            onDrop={(ingredient: IIngredient) =>
              onDropIngredient?.(ingredient, folder)
            }
            onClick={() => onSelectFolder?.(folder)}
            className={cn(
              'flex h-10 w-full items-center border-border bg-transparent px-3 py-0 text-muted-foreground hover:border-border-strong hover:bg-hover',
              selectedFolderId === folder.id &&
                'border-border-strong bg-hover text-foreground',
            )}
            isSelected={selectedFolderId === folder.id}
          />
        ))
      )}
    </div>
  );
}

export default memo(FoldersSidebar);
