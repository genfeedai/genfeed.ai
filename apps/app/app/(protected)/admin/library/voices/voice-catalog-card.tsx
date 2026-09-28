import { VoiceProvider } from '@genfeedai/contracts';
import type { VoiceCatalogCardProps as Props } from '@props/admin/voices.props';
import AudioPreviewPlayer from '@ui/audio/preview-player/AudioPreviewPlayer';
import Card from '@ui/card/Card';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import Badge from '@ui/display/badge/Badge';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { Volume2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function VoiceCatalogCard({
  togglingKey,
  voice,
  onToggle,
  isList = false,
}: Props) {
  const t = useTranslations('pages.adminVoices');
  const name = voice.name || voice.externalVoiceId || voice.id;
  const provider =
    voice.provider === VoiceProvider.ELEVENLABS
      ? 'ElevenLabs'
      : voice.provider === VoiceProvider.HEYGEN
        ? 'HeyGen'
        : (voice.provider ?? t('unknown'));
  const facts = (
    <>
      <Badge variant="outline">{provider}</Badge>
      {voice.isFeatured && <Badge variant="warning">{t('featured')}</Badge>}
      {voice.isDefaultSelectable === false && (
        <Badge variant="secondary">{t('notDefault')}</Badge>
      )}
      {voice.isActive === false && (
        <Badge variant="destructive">{t('inactive')}</Badge>
      )}
    </>
  );
  const preview = (
    <AudioPreviewPlayer audioUrl={voice.sampleAudioUrl ?? null} label={name} />
  );
  const actions = (
    <CollectionItemActions
      overflowLabel={t('actions', { name })}
      overflow={[
        {
          id: 'active',
          label: t(voice.isActive === false ? 'activate' : 'deactivate'),
          isDisabled: togglingKey !== null,
          onSelect: () => onToggle(voice, 'isActive', !voice.isActive),
        },
        {
          id: 'default',
          label: t(
            voice.isDefaultSelectable === false
              ? 'enableDefault'
              : 'disableDefault',
          ),
          isDisabled: togglingKey !== null,
          onSelect: () =>
            onToggle(
              voice,
              'isDefaultSelectable',
              voice.isDefaultSelectable === false,
            ),
        },
        {
          id: 'featured',
          label: t(voice.isFeatured ? 'unfeature' : 'feature'),
          isDisabled: togglingKey !== null,
          onSelect: () => onToggle(voice, 'isFeatured', !voice.isFeatured),
        },
      ]}
    />
  );
  if (isList)
    return (
      <ListRow
        density="compact"
        leading={<Volume2 className="size-4 shrink-0 text-muted-foreground" />}
        title={name}
        description={voice.externalVoiceId ?? voice.id}
        meta={
          <>
            <span className="flex flex-wrap gap-2">{facts}</span>
            <div className="w-full max-w-sm">{preview}</div>
          </>
        }
        trailing={actions}
      />
    );
  return (
    <Card bodyClassName="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{name}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {voice.externalVoiceId ?? voice.id}
          </p>
        </div>
        {actions}
      </div>
      <div className="flex flex-wrap gap-2">{facts}</div>
      {preview}
    </Card>
  );
}
