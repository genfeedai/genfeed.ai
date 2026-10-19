'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { AdminUserEmailProps } from '@props/admin/admin-user.props';
import { ClipboardService } from '@services/core/clipboard.service';
import { Button } from '@ui/primitives/button';
import { Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EMPTY_VALUE } from './user-display.helpers';

/**
 * The email opens the operator's mail client (mailto) and a copy button sits
 * beside it, so a user can be written to without retyping the address.
 */
export default function UserEmail({ email }: AdminUserEmailProps) {
  const translate = useTranslations('pages.adminUsers');

  if (!email) {
    return <span>{EMPTY_VALUE}</span>;
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <a
        className="truncate hover:underline"
        href={`mailto:${email}`}
        title={translate('sendEmail', { email })}
      >
        {email}
      </a>
      <Button
        ariaLabel={translate('copyEmail', { email })}
        icon={<Copy />}
        onClick={() => {
          void ClipboardService.getInstance().copyToClipboard(email);
        }}
        size={ButtonSize.ICON}
        tooltip={translate('copyEmailTooltip')}
        variant={ButtonVariant.GHOST}
      />
    </span>
  );
}
