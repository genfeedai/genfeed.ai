import {
  extractBrandFromKey,
  getBrandConfig,
} from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { getModelBrandIcon } from '@genfeedai/helpers/ui/icons/model-brand-icon';
import {
  getModelCategoryIcon,
  getModelCategoryLabel,
} from '@genfeedai/helpers/ui/icons/model-category-icon';
import { getModelProviderLabel } from '@genfeedai/helpers/ui/model-badge.helper';
import type { ModelAvatarProps } from '@genfeedai/props/ui/model-avatar.props';

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
    <span
      className={cn(
        'relative inline-flex shrink-0 text-foreground',
        isCategoryVisible ? 'h-8 w-10' : 'size-7',
        className,
      )}
      title={`${providerLabel} · ${categoryLabel}`}
      data-testid={testId}
    >
      <span
        className="flex size-7 items-center justify-center rounded-full border border-border bg-tertiary"
        role="img"
        aria-label={providerLabel}
      >
        {ProviderIcon ? (
          <ProviderIcon className="size-4" />
        ) : (
          <span className="text-2xs font-semibold" aria-hidden>
            {providerLabel.charAt(0)}
          </span>
        )}
      </span>
      {isCategoryVisible ? (
        <span
          className="absolute bottom-0 right-0 flex size-4.5 items-center justify-center rounded-full border border-border bg-tertiary"
          role="img"
          aria-label={categoryLabel}
        >
          <CategoryIcon className="size-3.5" aria-hidden />
        </span>
      ) : null}
    </span>
  );
}
