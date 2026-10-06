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
}: ModelAvatarProps) {
  const ProviderIcon = getModelBrandIcon(model.provider);
  const CategoryIcon = getModelCategoryIcon(model.category);
  const providerLabel = getModelProviderLabel(model.provider);
  const categoryLabel = getModelCategoryLabel(model.category);

  return (
    <span
      className={cn(
        'relative inline-flex h-8 w-10 shrink-0 text-foreground',
        className,
      )}
      title={`${providerLabel} · ${categoryLabel}`}
      data-testid={testId}
    >
      <span
        className="flex size-7 items-center justify-center rounded-full border border-border bg-background-secondary"
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
      <span
        className="absolute bottom-0 right-0 flex size-4.5 items-center justify-center rounded-full border border-border bg-background-secondary"
        role="img"
        aria-label={categoryLabel}
      >
        <CategoryIcon className="size-3.5" aria-hidden />
      </span>
    </span>
  );
}
