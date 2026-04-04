import type { IModel } from '@genfeedai/interfaces';
import type { ToolbarValues } from '@genfeedai/interfaces/ui/toolbar.interface';
import type { ChangeEvent } from 'react';

export interface ToolbarProps {
  models: IModel[];
  values: ToolbarValues;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  assetType?: string;
  isDisabled?: boolean;
}
