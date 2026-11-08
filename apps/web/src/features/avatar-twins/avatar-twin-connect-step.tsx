'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { Alert, AlertDescription } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { AvatarTwinConnectStepProps } from '@/features/avatar-twins/props/avatar-twin.props';

/**
 * A twin is created in the person's own HeyGen account, never the platform
 * one, so nothing starts until that account is connected.
 */
export default function AvatarTwinConnectStep({
  connectHref,
  isInvalid,
  onRecheck,
}: AvatarTwinConnectStepProps) {
  const translate = useTranslations('pages.library.avatarTwin.connect');

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-medium text-lg">{translate('title')}</h2>
      <p className="text-sm">{translate('body')}</p>
      {isInvalid ? (
        <Alert variant="warning">
          <AlertDescription>{translate('invalid')}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild withWrapper={false}>
          <Link href={connectHref}>{translate('action')}</Link>
        </Button>
        <Button
          label={translate('check')}
          onClick={onRecheck}
          variant={ButtonVariant.SECONDARY}
        />
      </div>
    </div>
  );
}
