import { AssetScope } from '@genfeedai/enums';

export interface ScopeOption {
  value: AssetScope;
  label: string;
  description: string;
  color: string;
  variant: string;
}

export const SCOPE_OPTIONS: readonly ScopeOption[] = [
  {
    color: 'text-gray-600',
    description: 'Only you can access',
    label: 'Private',
    value: AssetScope.USER,
    variant: 'badge-error',
  },
  {
    color: 'text-blue-600',
    description: 'Brand members can access',
    label: 'Brand',
    value: AssetScope.BRAND,
    variant: 'badge-warning',
  },
  {
    color: 'text-green-600',
    description: 'Team members can access',
    label: 'Organization',
    value: AssetScope.ORGANIZATION,
    variant: 'badge-warning',
  },
  {
    color: 'text-purple-600',
    description: 'Anyone can access',
    label: 'Public',
    value: AssetScope.PUBLIC,
    variant: 'badge-info',
  },
];

export function getScopeOption(scope: AssetScope): ScopeOption | undefined {
  return SCOPE_OPTIONS.find((option) => option.value === scope);
}
