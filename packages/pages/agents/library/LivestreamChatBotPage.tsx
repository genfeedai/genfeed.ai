'use client';

import { ButtonVariant } from '@genfeedai/enums';
import Card from '@ui/card/Card';
import Textarea from '@ui/inputs/textarea/Textarea';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
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

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading livestream bot…
      </div>
    );
  }

  const youtubeFirstStatus = session?.platformStates.find(
    (platformState) => platformState.platform === 'youtube',
  );
  const twitchStatus = session?.platformStates.find(
    (platformState) => platformState.platform === 'twitch',
  );

  return (
    <Container
      label="Livestream Chat Bot"
      description="YouTube is treated as the primary platform. Save the bot, connect the channel targets, then control the live session from the same screen."
    >
      <div className="space-y-6">
        <LivestreamBotConfigCard
          form={form}
          isSaving={isSaving}
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
              <h2 className="text-lg font-semibold">Runtime Controls</h2>
              <p className="text-sm text-muted-foreground">
                Session status: {session?.status || 'stopped'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                label="Start"
                variant={ButtonVariant.DEFAULT}
                onClick={() => void handleSessionAction('start')}
              />
              <Button
                label="Pause"
                variant={ButtonVariant.SECONDARY}
                onClick={() => void handleSessionAction('pause')}
              />
              <Button
                label="Resume"
                variant={ButtonVariant.SECONDARY}
                onClick={() => void handleSessionAction('resume')}
              />
              <Button
                label="Stop"
                variant={ButtonVariant.DESTRUCTIVE}
                onClick={() => void handleSessionAction('stop')}
              />
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="space-y-4">
              <h3 className="font-medium">Manual Override</h3>
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
              <h3 className="font-medium">Transcript Ingestion</h3>
              <Textarea
                label="Transcript Chunk"
                value={transcriptChunk}
                onChange={(event) => setTranscriptChunk(event.target.value)}
              />
              <Button
                label="Process Transcript"
                variant={ButtonVariant.SECONDARY}
                onClick={() => void handleIngestTranscript()}
              />
            </div>

            <div className="space-y-4">
              <h3 className="font-medium">Send One-Off Message</h3>
              <div className="flex gap-2">
                <Button
                  label="YouTube"
                  variant={
                    selectedPlatform === 'youtube'
                      ? ButtonVariant.DEFAULT
                      : ButtonVariant.SECONDARY
                  }
                  onClick={() => setSelectedPlatform('youtube')}
                />
                <Button
                  label="Twitch"
                  variant={
                    selectedPlatform === 'twitch'
                      ? ButtonVariant.DEFAULT
                      : ButtonVariant.SECONDARY
                  }
                  onClick={() => setSelectedPlatform('twitch')}
                />
              </div>
              <Textarea
                label="Message"
                placeholder="Leave blank to let the bot generate the next prompt."
                value={sendNowMessage}
                onChange={(event) => setSendNowMessage(event.target.value)}
              />
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
