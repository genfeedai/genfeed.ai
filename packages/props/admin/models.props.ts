import type { PageScope } from '@genfeedai/contracts';

export const ADMIN_MODEL_TYPE_TABS = [
  { label: 'Active', value: 'active' },
  { label: 'Image', value: 'image' },
  { label: 'Video', value: 'video' },
  { label: 'Music', value: 'music' },
  { label: 'Text', value: 'text' },
  { label: 'Other', value: 'other' },
  { label: 'All', value: 'all' },
] as const;

export type AdminModelType = (typeof ADMIN_MODEL_TYPE_TABS)[number]['value'];

export function isAdminModelType(value: string): value is AdminModelType {
  return ADMIN_MODEL_TYPE_TABS.some((tab) => tab.value === value);
}

export function resolveAdminModelType(
  value?: string | string[],
): AdminModelType {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && isAdminModelType(raw) ? raw : 'active';
}

export interface ModelsListProps {
  category?: AdminModelType;
  scope?: PageScope;
}
