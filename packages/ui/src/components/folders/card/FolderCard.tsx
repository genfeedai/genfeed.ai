'use client';

import type { FolderCardProps } from '@genfeedai/props/ui/content/folder.props';
import Card from '@ui/card/Card';
import { Folder } from 'lucide-react';

export default function FolderCard({ folder, onClick }: FolderCardProps) {
  const activateFolder = () => onClick?.(folder);

  return (
    <Card
      onClick={activateFolder}
      className="group cursor-pointer transition-[transform,box-shadow] hover:scale-105 hover:shadow-border-strong"
      bodyClassName="gap-0 p-4"
    >
      <div className="flex flex-col items-center gap-3">
        <Folder className="text-6xl text-primary/60 group-hover:text-primary transition-colors" />
        <div className="text-center">
          <h3 className="font-medium truncate max-w-40">{folder.label}</h3>
          {folder.description && (
            <p className="text-xs text-foreground/60 truncate max-w-40 mt-1">
              {folder.description}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
