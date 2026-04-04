import type { AssetScope } from '@genfeedai/enums';

export type ScopeSelectorVariant = 'default' | 'panel';

export interface ScopeSelectorProps {
  value: AssetScope;
  onChange: (scope: AssetScope) => void;
  isDisabled?: boolean;
  className?: string;
  variant?: ScopeSelectorVariant;
  showLabel?: boolean;
}

export interface ScopeBadgeProps {
  scope: AssetScope;
  className?: string;
}

export interface ScopeIconProps {
  scope: AssetScope;
  className?: string;
  showTooltip?: boolean;
}
