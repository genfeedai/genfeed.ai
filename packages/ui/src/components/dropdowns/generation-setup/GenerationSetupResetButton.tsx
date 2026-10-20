'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { GenerationSetupResetButtonProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { SHELL_ICON_CLASS } from '@ui/constants/shell-chrome.constant';
import { Button } from '@ui/primitives/button';
import { RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Reset all, as an icon. It stays in place, dimmed, when there is nothing to reset. */
export default function GenerationSetupResetButton({
  isDisabled = false,
  onResetAll,
}: GenerationSetupResetButtonProps) {
  const translate = useTranslations('agent.generationSetup');
  return (
    <Button
      ariaLabel={translate('resetAllAria')}
      className="size-8 shrink-0 min-h-0 min-w-0 p-0 text-muted-foreground"
      isDisabled={isDisabled}
      onClick={onResetAll}
      size={ButtonSize.ICON}
      tooltip={translate('resetAll')}
      tooltipPosition="top"
      variant={ButtonVariant.GHOST}
      withWrapper={false}
    >
      <RotateCcw aria-hidden="true" className={SHELL_ICON_CLASS} />
    </Button>
  );
}
