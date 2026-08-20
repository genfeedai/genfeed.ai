'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { IIngredient } from '@genfeedai/interfaces';
import type { FoldersSidebarProps } from '@genfeedai/props/content/folders-sidebar.props';
import DropZoneFolder from '@ui/drag-drop/zone-folder/DropZoneFolder';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Button } from '@ui/primitives/button';
import { Folder, Plus } from 'lucide-react';
import { memo } from 'react';

function FoldersSidebar({
  folders,
  selectedFolderId,
  onSelectFolder,
  onDropIngredient,
  onCreateFolder,
  isLoading = false,
  variant = 'panel',
}: FoldersSidebarProps) {
  if (variant === 'navigation') {
    return (
      <div className="mt-3 border-t border-border pt-2">
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
          <DropZoneFolder
            folder={null}
            onDrop={(ingredient: IIngredient) =>
              onDropIngredient?.(ingredient, null)
            }
            onClick={() => onSelectFolder?.(null)}
            className={cn(
              'flex h-8 w-full !rounded !border-transparent !px-2.5 !py-1.5 text-left text-foreground/72 hover:!bg-foreground/[0.06] hover:text-foreground',
              !selectedFolderId && '!bg-foreground/[0.06] text-foreground',
            )}
            isSelected={!selectedFolderId}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <Folder className="size-5 shrink-0 text-foreground/42" />
              <span className="truncate text-sm font-medium tracking-[-0.01em]">
                All assets
              </span>
            </div>
          </DropZoneFolder>

          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Spinner size={ComponentSize.SM} />
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
                  'flex h-8 w-full !rounded !border-transparent !px-2.5 !py-1.5 text-left text-foreground/72 hover:!bg-foreground/[0.06] hover:text-foreground',
                  selectedFolderId === folder.id &&
                    '!bg-foreground/[0.06] text-foreground',
                )}
                isSelected={selectedFolderId === folder.id}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Folder className="size-5 shrink-0 text-foreground/42" />
                  <span className="truncate text-sm font-medium tracking-[-0.01em]">
                    {folder.label}
                  </span>
                </div>
              </DropZoneFolder>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3">
      <div className="px-1">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-white/35">
            Folders
          </div>
          <div className="mt-1 text-sm font-medium text-white/78">
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
          'mb-2 flex h-10 w-full items-center px-3 py-0 border-white/[0.08] bg-white/[0.02] text-white/74 hover:border-white/[0.14] hover:bg-white/[0.04]',
          !selectedFolderId && 'border-white/[0.16] bg-white/[0.06]',
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
              'flex h-10 w-full items-center px-3 py-0 border-white/[0.08] bg-transparent text-white/72 hover:border-white/[0.14] hover:bg-white/[0.04]',
              selectedFolderId === folder.id &&
                'border-white/[0.16] bg-white/[0.06]',
            )}
            isSelected={selectedFolderId === folder.id}
          />
        ))
      )}
    </div>
  );
}

export default memo(FoldersSidebar);
