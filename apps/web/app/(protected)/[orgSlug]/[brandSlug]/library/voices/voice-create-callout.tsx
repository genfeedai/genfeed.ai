'use client';

import { ButtonVariant, CardVariant } from '@genfeedai/contracts';
import type { ElevenLabsAccountVoicePage } from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { VoicesService } from '@services/ingredients/voices.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { VoiceCreateCalloutProps } from '@/features/library/props/voice-create-callout.props';

/**
 * How a person makes their own voice. Voices are cloned only in the
 * organization's own provider account, so until one is connected the call
 * to action is to connect it, never to clone on the platform account.
 */
export default function VoiceCreateCallout({
  connectHref,
  onCloneVoice,
  twinHref,
}: VoiceCreateCalloutProps) {
  const translate = useTranslations('pages.library.createVoice');
  // Same key as the account-voices dialog's first page, so they share one read.
  const accountQuery = useAuthedQuery<
    VoicesService,
    ElevenLabsAccountVoicePage
  >({
    queryFn: (service, signal) => service.findAccountVoices({}, signal),
    queryKey: ['elevenlabs-account-voices', ''],
    service: (token: string) => VoicesService.getInstance(token),
  });
  const status = accountQuery.data?.connection.status;
  if (!status) return null;

  const isConnected = status === 'connected';
  const state = isConnected
    ? 'connected'
    : status === 'invalid'
      ? 'invalid'
      : 'disconnected';

  return (
    <Card variant={CardVariant.BORDERED}>
      <div className="flex flex-col gap-1" role="status">
        <p className="font-medium text-sm">{translate(`${state}.title`)}</p>
        <p className="text-muted-foreground text-sm">
          {translate(`${state}.body`)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {isConnected ? (
          <Button label={translate('clone')} onClick={onCloneVoice} />
        ) : (
          <Button asChild withWrapper={false}>
            <Link href={connectHref}>{translate('connect')}</Link>
          </Button>
        )}
        <Button asChild variant={ButtonVariant.SECONDARY} withWrapper={false}>
          <Link href={twinHref}>{translate('twin')}</Link>
        </Button>
      </div>
    </Card>
  );
}
