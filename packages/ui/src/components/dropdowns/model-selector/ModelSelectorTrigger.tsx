'use client';

import { extractBrandFromKey, getBrandConfig } from '@genfeedai/constants';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ModelSelectorTriggerProps } from '@genfeedai/props/ui/model-selector/model-selector.props';
import ModelSelectorCostBadge from '@ui/dropdowns/model-selector/ModelSelectorCostBadge';
import { Button, buttonVariants } from '@ui/primitives/button';
import { forwardRef } from 'react';
import {
  HiChevronDown,
  HiChevronUp,
  HiCpuChip,
  HiSparkles,
} from 'react-icons/hi2';

const ModelSelectorTrigger = forwardRef<
  HTMLButtonElement,
  ModelSelectorTriggerProps & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function ModelSelectorTrigger(
  { selectedModels, isOpen, shouldFlash, className, autoLabel, ...buttonProps },
  ref,
) {
  const ChevronIcon = isOpen ? HiChevronUp : HiChevronDown;
  const triggerClassName = cn(
    buttonVariants({
      size: ButtonSize.SM,
      variant: ButtonVariant.GHOST,
    }),
    'font-medium',
    className,
  );

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
        {...buttonProps}
      >
        <HiCpuChip className="w-4 h-4" />
        <span className="text-xs font-medium">Select models...</span>
        <ChevronIcon className="h-3 w-3 text-foreground/50" />
      </Button>
    );
  }

  if (selectedModels.length === 1) {
    const model = selectedModels[0];

    if (String(model.key) === '__auto_model__') {
      return (
        <Button
          ref={ref}
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          className={cn(triggerClassName, 'text-foreground')}
          {...buttonProps}
        >
          <HiSparkles className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-xs font-medium truncate max-w-[148px]">
            {autoLabel ?? model.label}
          </span>
          <ChevronIcon className="h-3 w-3 text-foreground/50" />
        </Button>
      );
    }

    const brandSlug = extractBrandFromKey(model.key);
    const brandConfig = getBrandConfig(brandSlug);
    const BrandIcon = brandConfig.icon;

    return (
      <Button
        ref={ref}
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        className={cn(triggerClassName, 'text-foreground')}
        {...buttonProps}
      >
        <div
          className="h-4 w-4 rounded-sm border border-white/8 flex items-center justify-center text-[9px] font-bold shrink-0"
          style={{
            backgroundColor: `${brandConfig.color}20`,
            color: brandConfig.color,
          }}
          data-testid="model-trigger-provider-icon"
        >
          {BrandIcon ? (
            <BrandIcon className="h-2.5 w-2.5" />
          ) : (
            brandConfig.label.charAt(0)
          )}
        </div>
        <span className="text-xs font-medium truncate max-w-[148px]">
          {model.label}
        </span>
        <ModelSelectorCostBadge costTier={model.costTier} />
        <ChevronIcon className="h-3 w-3 text-foreground/50" />
      </Button>
    );
  }

  return (
    <Button
      ref={ref}
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      className={cn(triggerClassName, 'text-foreground')}
      {...buttonProps}
    >
      <HiCpuChip className="w-4 h-4" />
      <span className="text-xs font-medium">
        {selectedModels.length} models
      </span>
      <ChevronIcon className="h-3 w-3 text-foreground/50" />
    </Button>
  );
});

export default ModelSelectorTrigger;
