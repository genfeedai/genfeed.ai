import type { IModel } from '@genfeedai/contracts/interfaces';
import type { ToolbarValues } from '@genfeedai/contracts/interfaces/ui/toolbar.interface';
import type { ChangeEvent } from 'react';

export interface ToolbarProps {
  models: IModel[];
  values: ToolbarValues;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  assetType?: string;
  isDisabled?: boolean;
}
