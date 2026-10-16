import type { IQuickAction } from '@genfeedai/contracts/interfaces/ui/quick-actions.interface';
import type { ReactNode } from 'react';

export interface SaveAsCharacterProps {
  assetId: string;
  active?: boolean;
  imageUrl: string;
  /**
   * Receives the "Save as character" action plus one "Add to @handle" action
   * for each existing character that does not yet use the image.
   */
  children?: (
    action: IQuickAction | null,
    addActions: IQuickAction[],
  ) => ReactNode;
}
