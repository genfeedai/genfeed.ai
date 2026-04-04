import type { IFolder, IIngredient } from '@genfeedai/interfaces';
import type { ReactNode } from 'react';

export interface FolderDropZoneProps {
  folder: IFolder | null;
  onDrop: (ingredient: IIngredient, folder: IFolder | null) => void;
  className?: string;
  children?: ReactNode;
  isSelected?: boolean;
  onClick?: () => void;
}
