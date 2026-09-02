'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant, Platform } from '@genfeedai/contracts';
import { usePlatformOAuthConnect } from '@hooks/auth/use-platform-oauth-connect/use-platform-oauth-connect';
import { logger } from '@services/core/logger.service';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import LivestreamBotConfigCard from './LivestreamBotConfigCard';
import LivestreamPlatformTargets from './LivestreamPlatformTargets';
import LivestreamSessionPanels from './LivestreamSessionPanels';
import {
  type LivestreamPagePlatform,
  useLivestreamChatBotPage,
} from './useLivestreamChatBotPage';

interface LivestreamChatBotPageProps {
  defaultPlatform: LivestreamPagePlatform;
}

export default function LivestreamChatBotPage({
  defaultPlatform,
}: LivestreamChatBotPageProps) {
  const translate = useTranslations('common.livestreamBot');
  const { brandId } = useBrand();
  const connectPlatform = usePlatformOAuthConnect({ brandId });
  const [isConnectingRestream, setIsConnectingRestream] = useState(false);

  const {
    form,
    handleApplyOverride,
    handleIngestTranscript,
    handleSave,
    handleSendNow,
    handleSessionAction,
    isLoading,
    isSaving,
    manualTopic,
    promotionAngle,
    recentDeliveries,
    restreamCredentials,
    selectedPlatform,
    sendNowMessage,
    session,
    setForm,
    setManualTopic,
    setPromotionAngle,
    setSendNowMessage,
    setSelectedPlatform,
    setTranscriptChunk,
    transcriptChunk,
  } = useLivestreamChatBotPage(defaultPlatform);

  const handleConnectRestream = useCallback(async () => {
    setIsConnectingRestream(true);
    try {
      await connectPlatform(Platform.RESTREAM);
    } catch (error) {
      logger.error('Restream OAuth connect failed', error);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Could not start Restream connect',
      );
      setIsConnectingRestream(false);
    }
  }, [connectPlatform]);

  const youtubeFirstStatus = session?.platformStates.find(
    (platformState) => platformState.platform === Platform.YOUTUBE,
  );
  const twitchStatus = session?.platformStates.find(
    (platformState) => platformState.platform === Platform.TWITCH,
  );

  return (
    <Container
      label="Livestream Chat Bot"
      description="YouTube is treated as the primary platform. Save the bot, connect the channel targets, then control the live session from the same screen."
    >
      <div className="space-y-6">
        <LivestreamBotConfigCard
          form={form}
          isConnectingRestream={isConnectingRestream}
          isSaving={isSaving || isLoading}
          restreamCredentials={restreamCredentials}
          onConnectRestream={() => void handleConnectRestream()}
          onFormChange={(patch) =>
            setForm((current) => ({ ...current, ...patch }))
          }
          onSave={() => void handleSave()}
        />

        <LivestreamPlatformTargets
          form={form}
          onFormChange={(patch) =>
            setForm((current) => ({ ...current, ...patch }))
          }
          youtubeLastPostedAt={youtubeFirstStatus?.lastPostedAt}
          twitchLastPostedAt={twitchStatus?.lastPostedAt}
        />

        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                {translate('runtimeControls')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {translate('sessionStatus')}:{' '}
                {isLoading ? '-' : session?.status || 'stopped'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                label="Start"
                variant={ButtonVariant.DEFAULT}
                disabled={isLoading}
                onClick={() => void handleSessionAction('start')}
              />
              <Button
                label="Pause"
                variant={ButtonVariant.SECONDARY}
                disabled={isLoading}
                onClick={() => void handleSessionAction('pause')}
              />
              <Button
                label="Resume"
                variant={ButtonVariant.SECONDARY}
                disabled={isLoading}
                onClick={() => void handleSessionAction('resume')}
              />
              <Button
                label="Stop"
                variant={ButtonVariant.DESTRUCTIVE}
                disabled={isLoading}
                onClick={() => void handleSessionAction('stop')}
              />
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="space-y-4">
              <h3 className="font-medium">{translate('manualOverride')}</h3>
              <Input
                label="Current Topic"
                value={manualTopic}
                onChange={(event) => setManualTopic(event.target.value)}
              />
              <Input
                label="Promotion Angle"
                value={promotionAngle}
                onChange={(event) => setPromotionAngle(event.target.value)}
              />
              <Button
                label="Apply Override"
                variant={ButtonVariant.SECONDARY}
                onClick={() => void handleApplyOverride()}
              />
            </div>

            <div className="space-y-4">
              <h3 className="font-medium">
                {translate('transcriptIngestion')}
              </h3>
              <div className="space-y-1.5">
                <Label
                  htmlFor="transcript-chunk"
                  className="text-sm font-medium text-foreground"
                >
                  {translate('transcriptChunk')}
                </Label>
                <Textarea
                  id="transcript-chunk"
                  value={transcriptChunk}
                  onChange={(event) => setTranscriptChunk(event.target.value)}
                />
              </div>
              <Button
                label="Process Transcript"
                variant={ButtonVariant.SECONDARY}
                onClick={() => void handleIngestTranscript()}
              />
            </div>

            <div className="space-y-4">
              <h3 className="font-medium">{translate('sendOneOffMessage')}</h3>
              <div className="flex gap-2">
                <Button
                  label="YouTube"
                  variant={
                    selectedPlatform === Platform.YOUTUBE
                      ? ButtonVariant.DEFAULT
                      : ButtonVariant.SECONDARY
                  }
                  onClick={() => setSelectedPlatform('youtube')}
                />
                <Button
                  label="Twitch"
                  variant={
                    selectedPlatform === Platform.TWITCH
                      ? ButtonVariant.DEFAULT
                      : ButtonVariant.SECONDARY
                  }
                  onClick={() => setSelectedPlatform('twitch')}
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="send-now-message"
                  className="text-sm font-medium text-foreground"
                >
                  {translate('message')}
                </Label>
                <Textarea
                  id="send-now-message"
                  placeholder="Leave blank to let the bot generate the next prompt."
                  value={sendNowMessage}
                  onChange={(event) => setSendNowMessage(event.target.value)}
                />
              </div>
              <Button
                label="Send Now"
                variant={ButtonVariant.DEFAULT}
                onClick={() => void handleSendNow()}
              />
            </div>
          </div>
        </Card>

        <LivestreamSessionPanels
          recentDeliveries={recentDeliveries}
          session={session}
        />
      </div>
    </Container>
  );
}
