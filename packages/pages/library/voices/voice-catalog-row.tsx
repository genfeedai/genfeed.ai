'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { Voice } from '@models/ingredients/voice.model';
import AudioPreviewPlayer from '@ui/audio/preview-player/AudioPreviewPlayer';
import Button from '@ui/buttons/base/Button';
import Badge from '@ui/display/badge/Badge';
import ListRowSound from '@ui/lists/row-sound/ListRowSound';
import { HiTrash } from 'react-icons/hi2';

function getProviderLabel(provider?: string): string {
  switch (provider) {
    case 'elevenlabs':
      return 'ElevenLabs';
    case 'heygen':
      return 'HeyGen';
    case 'genfeed-ai':
      return 'Genfeed';
    default:
      return provider ?? 'Unknown';
  }
}

function getVoiceSourceLabel(voice: Voice): string {
  if (voice.isCloned || voice.voiceSource === 'cloned') {
    return 'Cloned';
  }

  if (voice.voiceSource === 'generated') {
    return 'Generated';
  }

  return 'Catalog';
}

function getProviderMeta(voice: Voice): string | null {
  const index = voice.providerData?.index;
  return typeof index === 'number' ? `Index ${index}` : null;
}

function getVoiceName(voice: Voice): string {
  return voice.metadataLabel || voice.externalVoiceId || voice.id;
}

function getVoicePreview(voice: Voice): string | null {
  return voice.sampleAudioUrl ?? null;
}

function getVoiceSubtitle(voice: Voice): string {
  const metadata = voice.metadata as
    | {
        description?: string;
      }
    | undefined;

  return metadata?.description || voice.externalVoiceId || voice.id;
}

export interface VoiceCatalogRowProps {
  isBrandDefault: boolean;
  isOrgDefault: boolean;
  isSavingBrandDefault: boolean;
  isSavingOrgDefault: boolean;
  onDelete?: (() => void) | null;
  onSaveBrandDefault?: (() => void) | null;
  onSaveOrganizationDefault: () => void;
  selectedBrandLabel?: string;
  voice: Voice;
}

export default function VoiceCatalogRow({
  isBrandDefault,
  isOrgDefault,
  isSavingBrandDefault,
  isSavingOrgDefault,
  onDelete,
  onSaveBrandDefault,
  onSaveOrganizationDefault,
  selectedBrandLabel,
  voice,
}: VoiceCatalogRowProps) {
  return (
    <ListRowSound
      className="grid-cols-1 items-start gap-3 lg:grid-cols-[auto_minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_auto] lg:items-center"
      isActive={isOrgDefault || isBrandDefault}
      title={getVoiceName(voice)}
      subtitle={getVoiceSubtitle(voice)}
      badges={
        <>
          <Badge variant="secondary">{getProviderLabel(voice.provider)}</Badge>
          <Badge variant="ghost">{getVoiceSourceLabel(voice)}</Badge>
          {voice.cloneStatus ? (
            <Badge variant="outline">{voice.cloneStatus}</Badge>
          ) : null}
          {voice.isFeatured ? <Badge variant="accent">Featured</Badge> : null}
          {isOrgDefault ? <Badge variant="success">Org Default</Badge> : null}
          {isBrandDefault ? (
            <Badge variant="primary">
              {selectedBrandLabel ?? 'Brand'} Default
            </Badge>
          ) : null}
        </>
      }
      metaPrimary={
        <div className="space-y-1">
          <div>{voice.externalVoiceId ?? voice.id}</div>
          {voice.isDefaultSelectable === false ? (
            <div className="text-xs text-warning">Not default selectable</div>
          ) : null}
        </div>
      }
      metaSecondary={getProviderMeta(voice)}
      stats={
        <div className="flex flex-wrap items-center gap-2">
          <AudioPreviewPlayer
            audioUrl={getVoicePreview(voice)}
            label={getVoiceName(voice)}
          />
        </div>
      }
      actions={
        <>
          <Button
            isDisabled={
              isSavingOrgDefault || voice.isDefaultSelectable === false
            }
            onClick={onSaveOrganizationDefault}
            size={ButtonSize.SM}
            variant={
              isOrgDefault ? ButtonVariant.DEFAULT : ButtonVariant.SECONDARY
            }
            withWrapper={false}
          >
            {isOrgDefault ? 'Organization Default' : 'Set Org Default'}
          </Button>

          {onSaveBrandDefault ? (
            <Button
              isDisabled={
                isSavingBrandDefault || voice.isDefaultSelectable === false
              }
              onClick={onSaveBrandDefault}
              size={ButtonSize.SM}
              variant={
                isBrandDefault ? ButtonVariant.DEFAULT : ButtonVariant.OUTLINE
              }
              withWrapper={false}
            >
              {isBrandDefault
                ? `${selectedBrandLabel ?? 'Brand'} Default`
                : `Set ${selectedBrandLabel ?? 'Brand'} Default`}
            </Button>
          ) : null}

          {onDelete ? (
            <Button
              ariaLabel={`Delete ${getVoiceName(voice)}`}
              className="text-muted-foreground hover:text-destructive"
              onClick={onDelete}
              size={ButtonSize.XS}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            >
              <HiTrash className="h-4 w-4" />
            </Button>
          ) : null}
        </>
      }
    />
  );
}
