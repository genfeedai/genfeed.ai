'use client';

import { ButtonVariant, CardVariant } from '@genfeedai/contracts';
import type {
  ElevenLabsAccountVoicePage,
  IHeyGenConnectionStatus,
} from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { HeyGenService } from '@services/ingredients/heygen.service';
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
  onUploadSample,
  recordHref,
  twinHref,
}: VoiceCreateCalloutProps) {
  const translate = useTranslations('pages.library.createVoice');
  // Same keys as the account-voices dialog and the voice studio: one read each.
  const elevenLabsQuery = useAuthedQuery<
    VoicesService,
    ElevenLabsAccountVoicePage
  >({
    queryFn: (service, signal) => service.findAccountVoices({}, signal),
    queryKey: ['elevenlabs-account-voices', ''],
    service: (token: string) => VoicesService.getInstance(token),
  });
  const heyGenQuery = useAuthedQuery<HeyGenService, IHeyGenConnectionStatus>({
    queryFn: (service, signal) => service.fetchConnectionStatus(signal),
    queryKey: ['heygen-connection-status'],
    service: (token: string) => HeyGenService.getInstance(token),
  });
  const elevenLabsStatus = elevenLabsQuery.data?.connection.status;
  const heyGenState = heyGenQuery.data?.state;
  if (!elevenLabsStatus && !heyGenState) return null;

  const hasElevenLabs = elevenLabsStatus === 'connected';
  const isConnected = hasElevenLabs || heyGenState === 'connected';
  const state = isConnected
    ? 'connected'
    : elevenLabsStatus === 'invalid' || heyGenState === 'invalid'
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
          <Button asChild withWrapper={false}>
            <Link href={recordHref}>{translate('record')}</Link>
          </Button>
        ) : (
          <Button asChild withWrapper={false}>
            <Link href={connectHref}>{translate('connect')}</Link>
          </Button>
        )}
        {hasElevenLabs ? (
          <Button
            label={translate('upload')}
            onClick={onUploadSample}
            variant={ButtonVariant.SECONDARY}
          />
        ) : null}
        <Button asChild variant={ButtonVariant.SECONDARY} withWrapper={false}>
          <Link href={twinHref}>{translate('twin')}</Link>
        </Button>
      </div>
    </Card>
  );
}
