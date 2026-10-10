'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { getModelCategoryIcon } from '@genfeedai/helpers/ui/icons/model-category-icon';
import type { GenerationSetupTriggerProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import {
  SHELL_CONTROL_HEIGHT_CLASS,
  SHELL_ICON_CLASS,
} from '@ui/constants/shell-chrome.constant';
import { isAutoGenerationModelKey } from '@ui/dropdowns/model-selector/model-selector.constants';
import { Button } from '@ui/primitives/button';
import { ChevronsUpDown, Sparkles } from 'lucide-react';
import { type ButtonHTMLAttributes, memo, type Ref } from 'react';

/**
 * Compact `{Type} · {Model or Auto} · {ratio}` summary chip. Carries a subtle
 * accent tint whenever every field is still agent-owned (empty `sources` and
 * no pinned preset) so the operator can tell at a glance the agent hasn't
 * been overridden yet.
 */
const GenerationSetupTrigger = memo(function GenerationSetupTrigger({
  className,
  hasAspectRatio = true,
  isDisabled,
  isIconOnly = false,
  isOpen: _isOpen,
  isTypeCommitted = false,
  models,
  ref,
  setup,
  typeOptions,
  triggerLabel,
  ...buttonProps
}: GenerationSetupTriggerProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> }) {
  const isTypeAgentOwned =
    !isTypeCommitted &&
    !setup.presetId &&
    setup.sources.type !== 'user' &&
    setup.sources.type !== 'preset';
  const isTextType = setup.values.type === 'text';
  const selectedModel = isAutoGenerationModelKey(setup.values.modelKey)
    ? undefined
    : models.find((model) => model.key === setup.values.modelKey);
  const CategoryIcon = getModelCategoryIcon(setup.values.type, selectedModel);

  const typeLabel = isTypeAgentOwned
    ? 'Agent'
    : (typeOptions.find((option) => option.value === setup.values.type)
        ?.label ?? setup.values.type);

  const modelLabel = isAutoGenerationModelKey(setup.values.modelKey)
    ? 'Auto'
    : (selectedModel?.label ?? setup.values.modelKey);

  const showMediaSummary = !isTypeAgentOwned && !isTextType && hasAspectRatio;

  const summaryParts = [
    typeLabel,
    isTypeAgentOwned || isTextType ? undefined : modelLabel,
    showMediaSummary ? setup.values.aspectRatio : undefined,
  ].filter((part): part is string => Boolean(part));

  const isFullyAgentOwned =
    Object.keys(setup.sources).length === 0 && !setup.presetId;

  return (
    <Button
      ariaLabel={
        triggerLabel ? `Generation setup: ${triggerLabel}` : 'Generation setup'
      }
      className={cn(
        SHELL_CONTROL_HEIGHT_CLASS,
        'min-w-0 max-w-full flex-nowrap gap-1.5 overflow-hidden px-2.5 font-medium text-foreground',
        isFullyAgentOwned && 'border-primary/30 bg-primary/5 text-primary',
        isIconOnly &&
          'size-8 shrink-0 min-h-0 min-w-0 justify-center overflow-visible p-0',
        className,
      )}
      isDisabled={isDisabled}
      ref={ref}
      size={isIconOnly ? ButtonSize.ICON : ButtonSize.SM}
      textTransform="none"
      title={triggerLabel ?? summaryParts.join(' · ')}
      variant={ButtonVariant.GHOST}
      withWrapper={false}
      {...buttonProps}
    >
      {isTypeAgentOwned ? (
        <Sparkles
          aria-hidden="true"
          className={cn(
            SHELL_ICON_CLASS,
            isFullyAgentOwned ? 'text-primary' : 'text-muted-foreground',
          )}
        />
      ) : selectedModel && !isIconOnly ? null : (
        <CategoryIcon aria-hidden="true" className={SHELL_ICON_CLASS} />
      )}
      {!isIconOnly ? (
        <>
          <span className="min-w-0 flex-1 truncate text-xs font-medium">
            {triggerLabel ?? summaryParts.join(' · ')}
          </span>
          <ChevronsUpDown
            className={cn(SHELL_ICON_CLASS, 'text-muted-foreground')}
          />
        </>
      ) : null}
    </Button>
  );
});

export default GenerationSetupTrigger;
