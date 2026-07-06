'use client';

import { ButtonSize, ButtonVariant, VoiceProvider } from '@genfeedai/enums';
import type { ExternalVoice } from '@models/elements/external-voice.model';
import AudioPreviewPlayer from '@ui/audio/preview-player/AudioPreviewPlayer';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import { Button } from '@ui/primitives/button';
import { HiSparkles, HiStar } from 'react-icons/hi2';

function getVoiceName(voice: ExternalVoice): string {
  return voice.name || voice.externalVoiceId || voice.id;
}

function getProviderLabel(provider?: string): string {
  switch (provider) {
    case VoiceProvider.ELEVENLABS:
      return 'ElevenLabs';
    case VoiceProvider.HEYGEN:
      return 'HeyGen';
    default:
      return provider ?? 'Unknown';
  }
}

type Props = {
  togglingKey: string | null;
  voice: ExternalVoice;
  onToggle: (
    voice: ExternalVoice,
    field: 'isActive' | 'isDefaultSelectable' | 'isFeatured',
    value: boolean,
  ) => void;
};

export default function VoiceCatalogCard({
  togglingKey,
  voice,
  onToggle,
}: Props) {
  const activeKey = `${voice.id}:isActive`;
  const defaultKey = `${voice.id}:isDefaultSelectable`;
  const featuredKey = `${voice.id}:isFeatured`;

  return (
    <Card key={voice.id}>
      <div className="space-y-4 p-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{getProviderLabel(voice.provider)}</Badge>
            {voice.isFeatured ? (
              <Badge variant="warning">Featured</Badge>
            ) : null}
            {voice.isDefaultSelectable === false ? (
              <Badge variant="secondary">Not default selectable</Badge>
            ) : null}
            {voice.isActive === false ? (
              <Badge variant="destructive">Inactive</Badge>
            ) : null}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {getVoiceName(voice)}
            </h3>
            <p className="truncate text-xs text-foreground/50">
              {voice.externalVoiceId ?? voice.id}
            </p>
          </div>
        </div>

        <InsetSurface density="compact" tone="contrast">
          <AudioPreviewPlayer
            audioUrl={voice.sampleAudioUrl ?? null}
            label={getVoiceName(voice)}
          />
        </InsetSurface>

        <div className="grid gap-2">
          <Button
            isDisabled={togglingKey === activeKey}
            onClick={() => onToggle(voice, 'isActive', !voice.isActive)}
            size={ButtonSize.SM}
            variant={
              voice.isActive === false
                ? ButtonVariant.OUTLINE
                : ButtonVariant.DEFAULT
            }
            withWrapper={false}
          >
            <HiSparkles className="mr-2 size-4" />
            {voice.isActive === false ? 'Activate' : 'Active'}
          </Button>

          <Button
            isDisabled={togglingKey === defaultKey}
            onClick={() =>
              onToggle(
                voice,
                'isDefaultSelectable',
                voice.isDefaultSelectable === false,
              )
            }
            size={ButtonSize.SM}
            variant={
              voice.isDefaultSelectable === false
                ? ButtonVariant.OUTLINE
                : ButtonVariant.SECONDARY
            }
            withWrapper={false}
          >
            {voice.isDefaultSelectable === false
              ? 'Enable default selection'
              : 'Default selectable'}
          </Button>

          <Button
            isDisabled={togglingKey === featuredKey}
            onClick={() => onToggle(voice, 'isFeatured', !voice.isFeatured)}
            size={ButtonSize.SM}
            variant={
              voice.isFeatured ? ButtonVariant.DEFAULT : ButtonVariant.GHOST
            }
            withWrapper={false}
          >
            <HiStar className="mr-2 size-4" />
            {voice.isFeatured ? 'Featured' : 'Mark featured'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
