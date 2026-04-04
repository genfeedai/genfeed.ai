import type { IModel } from '@cloud/interfaces';
import type { ToolbarValues } from '@cloud/interfaces/ui/toolbar.interface';
import type { ChangeEvent } from 'react';

export interface ToolbarProps {
  models: IModel[];
  values: ToolbarValues;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  assetType?: string;
  isDisabled?: boolean;
}
