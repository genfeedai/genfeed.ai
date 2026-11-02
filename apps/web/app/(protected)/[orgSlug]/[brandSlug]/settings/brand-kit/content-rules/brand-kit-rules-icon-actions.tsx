'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  SHELL_ICON_BUTTON_CLASS,
  SHELL_ICON_CLASS,
} from '@ui-constants/shell-chrome.constant';
import { Button } from '@ui/primitives/button';
import { Receipt, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface BrandKitRulesIconActionsProps {
  isPromoting: boolean;
  isSaving: boolean;
  onPromote: () => void;
  receiptsHref: string;
}

/** Content rules' two side actions, as ghost icons in the subbar. */
export default function BrandKitRulesIconActions({
  isPromoting,
  isSaving,
  onPromote,
  receiptsHref,
}: BrandKitRulesIconActionsProps) {
  const translate = useTranslations('pages.brandHarnessSettings');
  const receiptTranslate = useTranslations('pages.generationReceipts');
  return (
    <div className="flex items-center gap-1">
      <Button
        asChild
        className={SHELL_ICON_BUTTON_CLASS}
        size={ButtonSize.ICON}
        tooltip={receiptTranslate('open')}
        variant={ButtonVariant.GHOST}
        withWrapper={false}
      >
        <Link href={receiptsHref} aria-label={receiptTranslate('open')}>
          <Receipt className={SHELL_ICON_CLASS} />
        </Link>
      </Button>
      <Button
        ariaLabel={translate('promote')}
        className={SHELL_ICON_BUTTON_CLASS}
        icon={<Trophy className={SHELL_ICON_CLASS} />}
        isDisabled={isPromoting || isSaving}
        onClick={onPromote}
        size={ButtonSize.ICON}
        tooltip={translate('promote')}
        variant={ButtonVariant.GHOST}
        withWrapper={false}
      />
    </div>
  );
}
