'use client';

import type { FolderCardProps } from '@genfeedai/props/ui/content/folder.props';
import type { KeyboardEvent } from 'react';
import { HiFolder } from 'react-icons/hi2';

export default function FolderCard({ folder, onClick }: FolderCardProps) {
  const activateFolder = () => onClick?.(folder);
  const activateFolderFromKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    activateFolder();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={activateFolder}
      onKeyDown={activateFolderFromKeyboard}
      className="group cursor-pointer bg-card border border-white/[0.08] transition-all p-4 hover:scale-105"
    >
      <div className="flex flex-col items-center gap-3">
        <HiFolder className="text-6xl text-primary/60 group-hover:text-primary transition-colors" />
        <div className="text-center">
          <h3 className="font-medium truncate max-w-40">{folder.label}</h3>
          {folder.description && (
            <p className="text-xs text-foreground/60 truncate max-w-40 mt-1">
              {folder.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
