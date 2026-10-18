'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { AdminDownloadButtonProps } from '@props/admin/admin-page-shell.props';
import { Button } from '@ui/primitives/button';
import {
  SHELL_ICON_BUTTON_CLASS,
  SHELL_ICON_CLASS,
} from '@ui-constants/shell-chrome.constant';
import { Download } from 'lucide-react';

/** The admin subbar's ghost download button, the same on every page. */
export default function AdminDownloadButton({
  label,
  onClick,
  isDisabled = false,
}: AdminDownloadButtonProps) {
  return (
    <Button
      ariaLabel={label}
      className={SHELL_ICON_BUTTON_CLASS}
      disabled={isDisabled}
      onClick={onClick}
      size={ButtonSize.ICON}
      tooltip={label}
      variant={ButtonVariant.GHOST}
      withWrapper={false}
    >
      <Download className={SHELL_ICON_CLASS} />
    </Button>
  );
}
