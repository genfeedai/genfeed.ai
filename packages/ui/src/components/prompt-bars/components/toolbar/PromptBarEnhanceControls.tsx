'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PromptBarEnhanceControlsProps } from '@genfeedai/props/prompt-bars/prompt-bar-enhance-controls.props';
import {
  PROMPT_BAR_CHIP_CLASS,
  PROMPT_BAR_CHIP_FIT_CLASS,
  PROMPT_BAR_CHIP_LABEL_CLASS,
  SHELL_ICON_CLASS,
} from '@ui/constants/shell-chrome.constant';
import { Button } from '@ui/primitives/button';
import Spinner from '@ui/primitives/spinner';
import { WandSparkles } from 'lucide-react';
import type { ReactElement } from 'react';

/**
 * The one "Enhance prompt" control every composer shares (Agent and Studio): a
 * setup chip that rewrites the prompt in place, turns into Cancel while the
 * rewrite runs, and offers Undo once it has replaced the text. The composer
 * stays usable during enhancement, so the button switches instead of
 * disabling (#4676).
 */
export default function PromptBarEnhanceControls({
  isDisabled = false,
  isEnhancing,
  labels,
  onCancel,
  onEnhance,
  onUndo,
}: PromptBarEnhanceControlsProps): ReactElement {
  const ariaLabel = isEnhancing ? labels.cancelAria : labels.enhanceAria;

  return (
    <>
      <Button
        ariaLabel={ariaLabel}
        className={cn(PROMPT_BAR_CHIP_CLASS, PROMPT_BAR_CHIP_FIT_CLASS)}
        icon={
          isEnhancing ? (
            <Spinner className="size-4" />
          ) : (
            <WandSparkles aria-hidden="true" className={SHELL_ICON_CLASS} />
          )
        }
        isDisabled={!isEnhancing && isDisabled}
        onClick={isEnhancing ? onCancel : onEnhance}
        size={ButtonSize.SM}
        textTransform="none"
        tooltip={ariaLabel}
        tooltipPosition="top"
        variant={ButtonVariant.GHOST}
        withWrapper={false}
      >
        <span className={PROMPT_BAR_CHIP_LABEL_CLASS}>
          {labels.enhanceLabel}
        </span>
      </Button>
      {!isEnhancing && onUndo ? (
        <Button
          ariaLabel={labels.undoAria}
          className="h-8 shrink-0 px-2 text-xs"
          label={labels.undoLabel}
          onClick={onUndo}
          size={ButtonSize.XS}
          textTransform="none"
          variant={ButtonVariant.GHOST}
        />
      ) : null}
    </>
  );
}
