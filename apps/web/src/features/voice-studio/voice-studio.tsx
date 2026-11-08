'use client';

import { ButtonVariant, CardVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { Skeleton } from '@ui/primitives/skeleton';
import { Mic } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useVoiceStudio } from '@/features/voice-studio/hooks/use-voice-studio';
import VoiceStudioRecorder from '@/features/voice-studio/voice-studio-recorder';

/**
 * Record your own voice and clone it in your own HeyGen or ElevenLabs
 * account. Nothing is cloned on the platform account, so without a
 * connected account the only step is to connect one.
 */
export default function VoiceStudio() {
  const translate = useTranslations('pages.library.voiceStudio');
  const { href, orgHref } = useOrgUrl();
  const {
    connectedProviders,
    create,
    hasBrand,
    isLoading,
    phase,
    recheckConnections,
  } = useVoiceStudio();

  const renderBody = () => {
    if (isLoading) return <Skeleton className="h-64 w-full" />;
    if (connectedProviders.length === 0)
      return (
        <Card variant={CardVariant.BORDERED}>
          <div className="flex flex-col gap-1">
            <h2 className="font-medium text-base">
              {translate('connect.title')}
            </h2>
            <p className="text-muted-foreground text-sm">
              {translate('connect.body')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild withWrapper={false}>
              <Link href={orgHref(APP_ROUTES.SETTINGS.INTEGRATIONS)}>
                {translate('connect.action')}
              </Link>
            </Button>
            <Button
              label={translate('connect.recheck')}
              onClick={recheckConnections}
              variant={ButtonVariant.SECONDARY}
            />
          </div>
        </Card>
      );
    return (
      <VoiceStudioRecorder
        connectedProviders={connectedProviders}
        hasBrand={hasBrand}
        onCreate={create}
        phase={phase}
        voicesHref={href(APP_ROUTES.LIBRARY.VOICES)}
      />
    );
  };

  return (
    <Container icon={Mic} label={translate('title')}>
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <p className="text-muted-foreground text-sm">{translate('subtitle')}</p>
        {renderBody()}
      </div>
    </Container>
  );
}
