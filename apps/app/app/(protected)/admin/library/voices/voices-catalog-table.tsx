import { VoiceProvider } from '@genfeedai/contracts';
import type { ExternalVoice } from '@models/elements/external-voice.model';
import type { VoicesCatalogTableProps as Props } from '@props/admin/voices.props';
import type { TableColumn } from '@props/ui/display/table.props';
import AudioPreviewPlayer from '@ui/audio/preview-player/AudioPreviewPlayer';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import { useTranslations } from 'next-intl';

function getVoiceName(voice: ExternalVoice): string {
  return voice.name || voice.externalVoiceId || voice.id;
}

export default function VoicesCatalogTable({
  error,
  isLoading,
  togglingKey,
  voices,
  onToggle,
}: Props) {
  const t = useTranslations('pages.adminVoices');

  const getProviderLabel = (voice: ExternalVoice): string => {
    if (voice.provider === VoiceProvider.ELEVENLABS) {
      return 'ElevenLabs';
    }
    if (voice.provider === VoiceProvider.HEYGEN) {
      return 'HeyGen';
    }
    return voice.provider ?? t('unknown');
  };

  const columns: TableColumn<ExternalVoice>[] = [
    {
      header: t('columns.name'),
      key: 'name',
      render: (voice) => (
        <span className="font-medium">{getVoiceName(voice)}</span>
      ),
    },
    {
      header: t('columns.provider'),
      key: 'provider',
      render: (voice) => (
        <Badge variant="outline">{getProviderLabel(voice)}</Badge>
      ),
    },
    {
      header: t('columns.externalId'),
      key: 'externalVoiceId',
      render: (voice) => (
        <span className="font-mono text-xs text-muted-foreground">
          {voice.externalVoiceId ?? voice.id}
        </span>
      ),
    },
    {
      header: t('columns.language'),
      key: 'language',
      render: (voice) => voice.language || '—',
    },
    {
      header: t('columns.status'),
      key: 'status',
      render: (voice) => (
        <span className="flex flex-wrap gap-1.5">
          {voice.isActive === false ? (
            <Badge variant="destructive">{t('inactive')}</Badge>
          ) : (
            <Badge variant="success">{t('active')}</Badge>
          )}
          {voice.isFeatured && <Badge variant="warning">{t('featured')}</Badge>}
          {voice.isDefaultSelectable === false && (
            <Badge variant="secondary">{t('notDefault')}</Badge>
          )}
        </span>
      ),
    },
    {
      className: 'min-w-64',
      header: t('columns.preview'),
      key: 'sampleAudioUrl',
      render: (voice) => (
        <AudioPreviewPlayer
          audioUrl={voice.sampleAudioUrl ?? null}
          className="w-64"
          isTimelineVisible
          label={getVoiceName(voice)}
        />
      ),
    },
    {
      className: 'w-12 text-right',
      header: <span className="sr-only">{t('columns.actions')}</span>,
      key: 'actions',
      render: (voice) => {
        const name = getVoiceName(voice);

        return (
          <CollectionItemActions
            overflowLabel={t('actions', { name })}
            overflow={[
              {
                id: 'active',
                isDisabled: togglingKey !== null,
                label: t(voice.isActive === false ? 'activate' : 'deactivate'),
                onSelect: () => onToggle(voice, 'isActive', !voice.isActive),
              },
              {
                id: 'default',
                isDisabled: togglingKey !== null,
                label: t(
                  voice.isDefaultSelectable === false
                    ? 'enableDefault'
                    : 'disableDefault',
                ),
                onSelect: () =>
                  onToggle(
                    voice,
                    'isDefaultSelectable',
                    voice.isDefaultSelectable === false,
                  ),
              },
              {
                id: 'featured',
                isDisabled: togglingKey !== null,
                label: t(voice.isFeatured ? 'unfeature' : 'feature'),
                onSelect: () =>
                  onToggle(voice, 'isFeatured', !voice.isFeatured),
              },
            ]}
          />
        );
      },
    },
  ];

  return (
    <AppTable<ExternalVoice>
      ariaLabel={t('tableLabel')}
      columns={columns}
      emptyLabel={t('empty')}
      error={error}
      getRowKey={(voice) => voice.id}
      isLoading={isLoading}
      items={voices}
    />
  );
}
