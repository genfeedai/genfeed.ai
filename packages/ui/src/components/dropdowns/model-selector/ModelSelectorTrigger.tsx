'use client';

import { extractBrandFromKey, getBrandConfig } from '@genfeedai/constants';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { getModelBrandIcon } from '@genfeedai/helpers/ui/icons/model-brand-icon';
import type { ModelSelectorTriggerProps } from '@genfeedai/props/ui/model-selector/model-selector.props';
import {
  SHELL_CONTROL_HEIGHT_CLASS,
  SHELL_ICON_CLASS,
} from '@ui/constants/shell-chrome.constant';
import ModelSelectorCostBadge from '@ui/dropdowns/model-selector/ModelSelectorCostBadge';
import { Button } from '@ui/primitives/button';
import { buttonVariants } from '@ui/primitives/button.variants';
import { ChevronDown, ChevronUp, Cpu, Sparkles } from 'lucide-react';
import { type ButtonHTMLAttributes, memo, type Ref } from 'react';

const ModelSelectorTrigger = memo(function ModelSelectorTrigger({
  ref,
  selectedModels,
  isAutoSelected,
  isOpen,
  shouldFlash,
  className,
  autoLabel,
  ...buttonProps
}: ModelSelectorTriggerProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> }) {
  const ChevronIcon = isOpen ? ChevronUp : ChevronDown;
  // Same trigger metrics as ButtonDropdown so a model picker sitting next to an
  // aspect-ratio / duration control lines up instead of standing a few pixels taller.
  const triggerClassName = cn(
    buttonVariants({
      size: ButtonSize.SM,
      variant: ButtonVariant.GHOST,
    }),
    SHELL_CONTROL_HEIGHT_CLASS,
    'min-w-0 max-w-full flex-nowrap gap-1.5 overflow-hidden px-2.5 font-medium',
    className,
  );
  const labelClassName = 'min-w-0 flex-1 truncate text-xs font-medium';

  // Auto wins over any residual concrete model list — otherwise a stale
  // values[] entry keeps the last model label after the user picks Auto.
  if (isAutoSelected) {
    return (
      <Button
        ref={ref}
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        className={cn(triggerClassName, 'text-foreground')}
        textTransform="none"
        {...buttonProps}
      >
        <Sparkles className={cn(SHELL_ICON_CLASS, 'text-primary')} />
        <span className={labelClassName}>{autoLabel ?? 'Auto'}</span>
        <ChevronIcon className={cn(SHELL_ICON_CLASS, 'text-foreground/50')} />
      </Button>
    );
  }

  if (selectedModels.length === 0) {
    return (
      <Button
        ref={ref}
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        className={cn(
          triggerClassName,
          'text-foreground/70',
          shouldFlash && 'animate-pulse !border !border-white/50 !bg-white/10',
        )}
        textTransform="none"
        {...buttonProps}
      >
        <Cpu className={SHELL_ICON_CLASS} />
        <span className={labelClassName}>Select models…</span>
        <ChevronIcon className={cn(SHELL_ICON_CLASS, 'text-foreground/50')} />
      </Button>
    );
  }

  if (selectedModels.length === 1) {
    const model = selectedModels[0];
    const brandSlug = extractBrandFromKey(model.key);
    const brandConfig = getBrandConfig(brandSlug);
    const BrandIcon = getModelBrandIcon(brandConfig.iconKey);

    return (
      <Button
        ref={ref}
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        className={cn(triggerClassName, 'text-foreground')}
        textTransform="none"
        {...buttonProps}
      >
        <div
          className="size-4 rounded-sm border border-white/8 flex items-center justify-center text-2xs font-bold shrink-0"
          style={{
            backgroundColor: `${brandConfig.color}20`,
            color: brandConfig.color,
          }}
          data-testid="model-trigger-provider-icon"
        >
          {BrandIcon ? (
            <BrandIcon className="size-2.5" />
          ) : (
            brandConfig.label.charAt(0)
          )}
        </div>
        <span className={labelClassName}>{model.label}</span>
        <ModelSelectorCostBadge costTier={model.costTier} />
        <ChevronIcon className={cn(SHELL_ICON_CLASS, 'text-foreground/50')} />
      </Button>
    );
  }

  return (
    <Button
      ref={ref}
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      className={cn(triggerClassName, 'text-foreground')}
      textTransform="none"
      {...buttonProps}
    >
      <Cpu className={SHELL_ICON_CLASS} />
      <span className={labelClassName}>{selectedModels.length} models</span>
      <ChevronIcon className={cn(SHELL_ICON_CLASS, 'text-foreground/50')} />
    </Button>
  );
});

export default ModelSelectorTrigger;
