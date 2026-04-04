'use client';

import type { FolderCardProps } from '@props/ui/content/folder.props';
import { HiFolder } from 'react-icons/hi2';

export default function FolderCard({ folder, onClick }: FolderCardProps) {
  return (
    <div
      onClick={() => onClick?.(folder)}
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
