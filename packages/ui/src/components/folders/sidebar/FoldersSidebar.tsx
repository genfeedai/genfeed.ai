'use client';

import { ButtonVariant, ComponentSize } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { IIngredient } from '@genfeedai/interfaces';
import type { FoldersSidebarProps } from '@genfeedai/props/content/folders-sidebar.props';
import DropZoneFolder from '@ui/drag-drop/zone-folder/DropZoneFolder';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Button } from '@ui/primitives/button';
import { memo } from 'react';
import { HiPlus } from 'react-icons/hi2';

function FoldersSidebar({
  folders,
  selectedFolderId,
  onSelectFolder,
  onDropIngredient,
  onCreateFolder,
  isLoading = false,
}: FoldersSidebarProps) {
  return (
    <div className="w-full space-y-3">
      <div className="px-1">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
            Folders
          </div>
          <div className="mt-1 text-sm font-medium text-white/78">
            Organize reusable assets
          </div>
        </div>
      </div>

      {onCreateFolder && (
        <Button
          label={
            <>
              <HiPlus /> New Folder
            </>
          }
          variant={ButtonVariant.SECONDARY}
          className="flex h-10 w-full items-center justify-center rounded-lg px-3"
          onClick={onCreateFolder}
          withWrapper={false}
        />
      )}

      <DropZoneFolder
        folder={null}
        onDrop={(ingredient: IIngredient) =>
          onDropIngredient?.(ingredient, null)
        }
        onClick={() => onSelectFolder?.(null)}
        className={cn(
          'mb-2 border-white/[0.08] bg-white/[0.02] text-white/74 hover:border-white/[0.14] hover:bg-white/[0.04]',
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
              'border-white/[0.08] bg-transparent text-white/72 hover:border-white/[0.14] hover:bg-white/[0.04]',
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
