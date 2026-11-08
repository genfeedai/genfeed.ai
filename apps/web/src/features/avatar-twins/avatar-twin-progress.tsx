'use client';

import { useConfirmModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import { AvatarTwinStatus, ButtonVariant } from '@genfeedai/contracts';
import { logger } from '@services/core/logger.service';
import { Alert, AlertDescription } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Progress } from '@ui/primitives/progress';
import { ExternalLink } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { AvatarTwinProgressProps } from '@/features/avatar-twins/props/avatar-twin.props';

/**
 * Opens a tab synchronously (inside the click) so a popup blocker allows it,
 * then points it at the link once the API has issued one.
 */
async function openInNewTab(resolveUrl: () => Promise<string>): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const url = await resolveUrl();
    if (tab) {
      tab.opener = null;
      tab.location.href = url;
    } else {
      window.location.assign(url);
    }
  } catch (error: unknown) {
    tab?.close();
    throw error;
  }
}

/**
 * Everything after the take is submitted: training, the consent step on the
 * provider's page, a rejected or failed outcome, and the finished twin.
 */
export default function AvatarTwinProgress({
  libraryHref,
  onOpenConsent,
  onRemove,
  onRetake,
  twin,
}: AvatarTwinProgressProps) {
  const translate = useTranslations('pages.library.avatarTwin');
  const { openConfirm } = useConfirmModal();
  const [isOpeningConsent, setIsOpeningConsent] = useState(false);
  const [hasOpenedConsent, setHasOpenedConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const isConsentExpired =
    !!twin.consentLinkExpiresAt &&
    new Date(twin.consentLinkExpiresAt).getTime() <= Date.now();
  const canGiveConsent =
    twin.status === AvatarTwinStatus.AWAITING_CONSENT ||
    twin.status === AvatarTwinStatus.CONSENT_REJECTED;

  const handleOpenConsent = async () => {
    setConsentError(null);
    setIsOpeningConsent(true);
    try {
      await openInNewTab(onOpenConsent);
      setHasOpenedConsent(true);
    } catch (error: unknown) {
      logger.error('Avatar twin consent link failed', error);
      setConsentError(translate('consent.error'));
    } finally {
      setIsOpeningConsent(false);
    }
  };

  const handleRemove = () => {
    openConfirm({
      confirmLabel: translate('remove.confirm'),
      isError: true,
      label: translate('remove.title'),
      message: translate('remove.message'),
      onConfirm: async () => {
        setRemoveError(null);
        setIsRemoving(true);
        try {
          await onRemove();
        } catch (error: unknown) {
          logger.error('Avatar twin delete failed', error);
          setRemoveError(
            error instanceof Error && error.message
              ? error.message
              : translate('remove.error'),
          );
        } finally {
          setIsRemoving(false);
        }
      },
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-4">
        {twin.previewImageUrl ? (
          <div className="relative size-24 shrink-0 overflow-hidden rounded-lg border border-border">
            <Image
              alt={twin.name}
              className="object-cover"
              fill
              sizes="6rem"
              src={twin.previewImageUrl}
              unoptimized
            />
          </div>
        ) : null}
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-medium">{twin.name}</p>
          <p className="text-muted-foreground text-sm" role="status">
            {translate(`status.${twin.status}`)}
          </p>
          {twin.failureMessage &&
          (twin.status === AvatarTwinStatus.FAILED ||
            twin.status === AvatarTwinStatus.CONSENT_REJECTED) ? (
            <p className="text-sm">
              {translate('reason', { reason: twin.failureMessage })}
            </p>
          ) : null}
        </div>
      </div>

      {twin.status === AvatarTwinStatus.UPLOADING ||
      twin.status === AvatarTwinStatus.TRAINING ? (
        <Progress isIndeterminate />
      ) : null}

      {canGiveConsent ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">{translate('consent.body')}</p>
          {consentError ? (
            <Alert variant="destructive">
              <AlertDescription>{consentError}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              icon={<ExternalLink />}
              isLoading={isOpeningConsent}
              label={
                hasOpenedConsent ||
                isConsentExpired ||
                twin.status === AvatarTwinStatus.CONSENT_REJECTED
                  ? translate('consent.newLink')
                  : translate('consent.open')
              }
              onClick={() => {
                void handleOpenConsent();
              }}
            />
          </div>
          {hasOpenedConsent &&
          twin.status === AvatarTwinStatus.AWAITING_CONSENT ? (
            <p className="text-muted-foreground text-sm">
              {translate('consent.waiting')}
            </p>
          ) : null}
        </div>
      ) : null}

      {twin.status === AvatarTwinStatus.READY ? (
        <p className="text-sm">{translate('done.body')}</p>
      ) : null}

      {removeError ? (
        <Alert variant="destructive">
          <AlertDescription>{removeError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {twin.status === AvatarTwinStatus.READY ? (
          <Button asChild withWrapper={false}>
            <Link href={libraryHref}>{translate('done.library')}</Link>
          </Button>
        ) : null}
        {twin.status === AvatarTwinStatus.FAILED ||
        twin.status === AvatarTwinStatus.CONSENT_REJECTED ? (
          <Button
            label={translate('newTake')}
            onClick={onRetake}
            variant={ButtonVariant.SECONDARY}
          />
        ) : null}
        <Button
          isLoading={isRemoving}
          label={translate('remove.action')}
          onClick={handleRemove}
          variant={ButtonVariant.GHOST}
        />
      </div>
    </div>
  );
}
