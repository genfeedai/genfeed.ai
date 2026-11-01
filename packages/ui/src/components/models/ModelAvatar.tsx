import {
  extractBrandFromKey,
  getBrandConfig,
} from '@genfeedai/contracts/constants';
import { getModelBrandIcon } from '@genfeedai/helpers/ui/icons/model-brand-icon';
import {
  getModelCategoryIcon,
  getModelCategoryLabel,
} from '@genfeedai/helpers/ui/icons/model-category-icon';
import { getModelProviderLabel } from '@genfeedai/helpers/ui/model-badge.helper';
import type { ModelAvatarProps } from '@genfeedai/props/ui/model-avatar.props';
import { Avatar } from '@ui/primitives/avatar';

export default function ModelAvatar({
  model,
  className,
  testId,
  isCategoryVisible = true,
  isProviderVisible = true,
}: ModelAvatarProps) {
  const brand = getBrandConfig(extractBrandFromKey(model.key ?? 'model'));
  const isInfrastructureBrand = ['Fal', 'Replicate', 'GenFeed', 'Kie'].includes(
    brand.label,
  );
  const ProviderIcon = getModelBrandIcon(
    isProviderVisible
      ? model.provider
      : isInfrastructureBrand
        ? undefined
        : brand.iconKey,
  );
  const CategoryIcon = getModelCategoryIcon(model.category, model);
  const providerLabel = isProviderVisible
    ? getModelProviderLabel(model.provider)
    : isInfrastructureBrand
      ? 'Model'
      : brand.label;
  const categoryLabel = getModelCategoryLabel(model.category, model);

  return (
    <Avatar
      aria-label={providerLabel}
      badge={
        isCategoryVisible ? (
          <CategoryIcon aria-label={categoryLabel} role="img" />
        ) : undefined
      }
      className={className}
      data-testid={testId}
      fallback={ProviderIcon ? <ProviderIcon className="size-4" /> : undefined}
      name={providerLabel}
      role="img"
      size="md"
      title={`${providerLabel} · ${categoryLabel}`}
    />
  );
}
