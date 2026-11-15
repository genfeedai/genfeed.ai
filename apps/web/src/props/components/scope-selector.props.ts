import type { AssetScope } from '@genfeedai/contracts';

type ScopeSelectorVariant = 'default' | 'panel' | 'segmented';

export interface ScopeSelectorProps {
  value: AssetScope;
  onChange: (scope: AssetScope) => void;
  isDisabled?: boolean;
  className?: string;
  variant?: ScopeSelectorVariant;
  showLabel?: boolean;
}
