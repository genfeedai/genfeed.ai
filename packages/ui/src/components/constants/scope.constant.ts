import { AssetScope } from '@genfeedai/contracts';

export interface ScopeOption {
  value: AssetScope;
  label: string;
  description: string;
  color: string;
  variant: string;
}

export const SCOPE_OPTIONS: readonly ScopeOption[] = [
  {
    color: 'text-muted-foreground',
    description: 'Only you can access',
    label: 'Private',
    value: AssetScope.USER,
    variant: 'badge-error',
  },
  {
    color: 'text-categorical-blue',
    description: 'Brand members can access',
    label: 'Brand',
    value: AssetScope.BRAND,
    variant: 'badge-warning',
  },
  {
    color: 'text-categorical-emerald',
    description: 'Team members can access',
    label: 'Organization',
    value: AssetScope.ORGANIZATION,
    variant: 'badge-warning',
  },
  {
    color: 'text-categorical-violet',
    description: 'Anyone can access',
    label: 'Public',
    value: AssetScope.PUBLIC,
    variant: 'badge-info',
  },
];
