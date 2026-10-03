'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { HelpPopoverProps } from '@genfeedai/props/ui/layout/page-help.props';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import {
  SHELL_ICON_BUTTON_CLASS,
  SHELL_ICON_CLASS,
} from '@ui-constants/shell-chrome.constant';
import { CircleHelp } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Ghost "?" trigger that opens the page's About copy. One look everywhere. */
export default function HelpPopover({ help }: HelpPopoverProps) {
  const translate = useTranslations('ui.sectionTopbar');
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          ariaLabel={translate('help')}
          icon={<CircleHelp className={SHELL_ICON_CLASS} />}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          className={SHELL_ICON_BUTTON_CLASS}
          data-testid="page-help-trigger"
        />
      </PopoverTrigger>
      <PopoverContent align="end" className="max-w-80 text-sm">
        <p className="font-semibold text-foreground">{help.title}</p>
        <div className="mt-1 text-foreground/70">{help.body}</div>
      </PopoverContent>
    </Popover>
  );
}
