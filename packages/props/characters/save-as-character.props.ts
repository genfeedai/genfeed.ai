import type { IQuickAction } from '@genfeedai/contracts/interfaces/ui/quick-actions.interface';
import type { ReactNode } from 'react';

export interface SaveAsCharacterProps {
  assetId: string;
  active?: boolean;
  imageUrl: string;
  children?: (action: IQuickAction | null) => ReactNode;
}
