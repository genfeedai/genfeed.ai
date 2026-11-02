'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  SHELL_ICON_BUTTON_CLASS,
  SHELL_ICON_CLASS,
} from '@ui-constants/shell-chrome.constant';
import { Button } from '@ui/primitives/button';
import { FileUp, Globe, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { BrandKitIconActionsProps } from '@/features/brands/props/brand-kit-workspace.props';

/**
 * The three ways to fill a Brand Kit, as ghost icons in the subbar: scan a
 * website, import guidance, or take the interview.
 */
export default function BrandKitIconActions({
  guidedSetupHref,
  isDisabled,
  onManualImport,
  onScan,
}: BrandKitIconActionsProps) {
  const t = useTranslations('pages.brandKitSettings');
  return (
    <div className="flex items-center gap-1">
      <Button
        ariaLabel={t('scan')}
        className={SHELL_ICON_BUTTON_CLASS}
        icon={<Globe className={SHELL_ICON_CLASS} />}
        isDisabled={isDisabled}
        onClick={onScan}
        size={ButtonSize.ICON}
        tooltip={t('scan')}
        variant={ButtonVariant.GHOST}
        withWrapper={false}
      />
      <Button
        ariaLabel={t('manualImport')}
        className={SHELL_ICON_BUTTON_CLASS}
        icon={<FileUp className={SHELL_ICON_CLASS} />}
        isDisabled={isDisabled}
        onClick={onManualImport}
        size={ButtonSize.ICON}
        tooltip={t('manualImport')}
        variant={ButtonVariant.GHOST}
        withWrapper={false}
      />
      <Button
        asChild
        className={SHELL_ICON_BUTTON_CLASS}
        isDisabled={isDisabled}
        size={ButtonSize.ICON}
        tooltip={t('guidedSetup')}
        variant={ButtonVariant.GHOST}
        withWrapper={false}
      >
        <Link href={guidedSetupHref} aria-label={t('guidedSetup')}>
          <Sparkles className={SHELL_ICON_CLASS} />
        </Link>
      </Button>
    </div>
  );
}
