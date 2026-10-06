import {
  ModelCategory,
  ModelProvider,
  type PageScope,
} from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import type { ReactNode } from 'react';

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
  type?: string;
  category?: string;
  onRefreshRegister?: (fn: (() => Promise<void>) | null) => void;
  onPricingDetails?: (model: IModel) => void;
  renderExpandedRow?: (model: IModel) => ReactNode | undefined;
  renderToolbar?: (models: IModel[]) => ReactNode;
  scope?: PageScope;
}

export function resolveAdminModelFilters(
  params: URLSearchParams,
  legacyType?: string,
) {
  const categories = params
    .getAll('category')
    .filter((value) =>
      Object.values(ModelCategory).some((category) => category === value),
    );
  if (
    !params.has('category') &&
    legacyType &&
    Object.values(ModelCategory).some((value) => value === legacyType)
  )
    categories.push(legacyType);
  if (!params.has('category') && legacyType === 'other')
    categories.push(
      ModelCategory.TEXT,
      ModelCategory.IMAGE_EDIT,
      ModelCategory.VIDEO_EDIT,
      ModelCategory.IMAGE_UPSCALE,
      ModelCategory.VIDEO_UPSCALE,
      ModelCategory.VOICE,
    );
  const providers = params
    .getAll('provider')
    .filter((value) =>
      Object.values(ModelProvider).some((provider) => provider === value),
    );
  const statuses = params.has('status')
    ? params
        .getAll('status')
        .filter((value) => value === 'active' || value === 'inactive')
    : legacyType === 'active'
      ? ['active']
      : [];
  return { categories, providers, statuses };
}

export interface AdminModelsFiltersProps {
  category?: string;
}
export interface ModelPricingDetailsProps {
  modelId: string;
}
export interface ModelPricingToolbarProps {
  models: IModel[];
}
export interface AdminModelsPageContentProps {
  type: AdminModelType;
}
