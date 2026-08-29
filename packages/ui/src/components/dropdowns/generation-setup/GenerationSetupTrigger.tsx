'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { GenerationSetupTriggerProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import {
  SHELL_CONTROL_HEIGHT_CLASS,
  SHELL_ICON_CLASS,
} from '@ui/constants/shell-chrome.constant';
import { Button } from '@ui/primitives/button';
import { buttonVariants } from '@ui/primitives/button.variants';
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
  isDisabled,
  isOpen: _isOpen,
  models,
  ref,
  setup,
  typeOptions,
  ...buttonProps
}: GenerationSetupTriggerProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> }) {
  const typeLabel =
    typeOptions.find((option) => option.value === setup.values.type)?.label ??
    setup.values.type;

  const modelLabel =
    setup.values.modelKey === ''
      ? 'Auto'
      : (models.find((model) => model.key === setup.values.modelKey)?.label ??
        setup.values.modelKey);

  const summaryParts = [typeLabel, modelLabel, setup.values.aspectRatio].filter(
    (part): part is string => Boolean(part),
  );

  const isFullyAgentOwned =
    Object.keys(setup.sources).length === 0 && !setup.presetId;

  return (
    <Button
      ariaLabel="Generation setup"
      className={cn(
        buttonVariants({ size: ButtonSize.SM, variant: ButtonVariant.GHOST }),
        SHELL_CONTROL_HEIGHT_CLASS,
        'min-w-0 max-w-full flex-nowrap gap-1.5 overflow-hidden px-2.5 font-medium text-foreground',
        isFullyAgentOwned && 'border-primary/30 bg-primary/5 text-primary',
        className,
      )}
      isDisabled={isDisabled}
      ref={ref}
      textTransform="none"
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      {...buttonProps}
    >
      <Sparkles
        className={cn(
          SHELL_ICON_CLASS,
          isFullyAgentOwned ? 'text-primary' : 'text-muted-foreground',
        )}
      />
      <span className="min-w-0 flex-1 truncate text-xs font-medium">
        {summaryParts.join(' · ')}
      </span>
      <ChevronsUpDown
        className={cn(SHELL_ICON_CLASS, 'text-muted-foreground')}
      />
    </Button>
  );
});

export default GenerationSetupTrigger;
