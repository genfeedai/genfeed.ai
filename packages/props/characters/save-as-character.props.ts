import type { IQuickAction } from '@genfeedai/contracts/interfaces/ui/quick-actions.interface';
import type { ReactNode } from 'react';

export interface SaveAsCharacterProps {
  assetId: string;
  imageUrl: string;
  children?: (action: IQuickAction) => ReactNode;
}
