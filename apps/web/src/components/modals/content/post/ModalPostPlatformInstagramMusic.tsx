'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { InstagramAudioTrack } from '@genfeedai/contracts/api-types/contracts/instagram-publishing.contract';
import type { IPostPlatformConfig } from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { CredentialsService } from '@services/organization/credentials.service';
import { Button } from '@ui/primitives/button';
import RangeField from '@ui/primitives/range-field';
import Searchbar from '@ui/primitives/searchbar';
import Spinner from '@ui/primitives/spinner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type Props = {
  config: IPostPlatformConfig;
  isEnabled: boolean;
  isLoading: boolean;
  updatePlatformConfig: (
    credentialId: string,
    updates: Partial<IPostPlatformConfig>,
  ) => void;
};

/** Instagram lists at most this many tracks per search; all are shown, none scroll. */
const VISIBLE_TRACKS = 5;
const FULL_VOLUME = 100;

function createCredentialsService(token: string) {
  return new CredentialsService(token);
}

function artistOf(track: { artist?: string }): string {
  return track.artist ?? '';
}

/**
 * Picks the music a Reel carries from Instagram's catalog, and how loud it is
 * against the Reel's own sound. The catalog is read only after the person asks
 * to add music, so a Reel without music costs no request.
 */
export default function ModalPostPlatformInstagramMusic({
  config,
  isEnabled,
  isLoading,
  updatePlatformConfig,
}: Props) {
  const translate = useTranslations('ui.instagramReelMusic');
  const [isSearching, setIsSearching] = useState(false);
  const selected = config.reelAudio;
  const isDisabled = !isEnabled || isLoading;

  function choose(track: InstagramAudioTrack) {
    updatePlatformConfig(config.credentialId, {
      reelAudio: {
        artist: track.artist,
        audioId: track.id,
        audioVolume: selected?.audioVolume ?? FULL_VOLUME,
        title: track.title,
        videoVolume: selected?.videoVolume ?? FULL_VOLUME,
      },
    });
    setIsSearching(false);
  }

  function setVolume(key: 'audioVolume' | 'videoVolume', value: number) {
    if (!selected) {
      return;
    }
    updatePlatformConfig(config.credentialId, {
      reelAudio: { ...selected, [key]: value },
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{translate('heading')}</p>

      {selected ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm">
              {translate('attached', {
                artist: artistOf(selected),
                title: selected.title,
              })}
            </p>
            <Button
              type="button"
              label={translate('remove')}
              size={ButtonSize.SM}
              variant={ButtonVariant.GHOST}
              isDisabled={isDisabled}
              onClick={() =>
                updatePlatformConfig(config.credentialId, {
                  reelAudio: undefined,
                })
              }
            />
          </div>
          <RangeField
            isDisabled={isDisabled}
            label={translate('musicVolume')}
            max={100}
            min={1}
            name={`${config.credentialId}-audio-volume`}
            value={selected.audioVolume ?? FULL_VOLUME}
            onChange={(event) =>
              setVolume('audioVolume', Number(event.target.value))
            }
          />
          <RangeField
            isDisabled={isDisabled}
            label={translate('videoVolume')}
            max={100}
            min={1}
            name={`${config.credentialId}-video-volume`}
            value={selected.videoVolume ?? FULL_VOLUME}
            onChange={(event) =>
              setVolume('videoVolume', Number(event.target.value))
            }
          />
        </div>
      ) : isSearching ? (
        <ModalPostPlatformInstagramMusicSearch
          credentialId={config.credentialId}
          isDisabled={isDisabled}
          onChoose={choose}
        />
      ) : (
        <Button
          type="button"
          label={translate('searchPlaceholder')}
          variant={ButtonVariant.SECONDARY}
          isDisabled={isDisabled}
          onClick={() => setIsSearching(true)}
        />
      )}
    </div>
  );
}

type SearchProps = {
  credentialId: string;
  isDisabled: boolean;
  onChoose: (track: InstagramAudioTrack) => void;
};

/** The catalog search; mounted only while a person is choosing a track. */
function ModalPostPlatformInstagramMusicSearch({
  credentialId,
  isDisabled,
  onChoose,
}: SearchProps) {
  const translate = useTranslations('ui.instagramReelMusic');
  const [query, setQuery] = useState('');

  const tracksQuery = useAuthedQuery({
    enabled: Boolean(credentialId),
    queryFn: (service, signal) =>
      service.findCredentialInstagramAudio(credentialId, query, signal),
    queryKey: ['instagram-reel-music', credentialId, query],
    service: createCredentialsService,
    staleTime: 60_000,
  });
  const tracks: InstagramAudioTrack[] = (tracksQuery.data ?? []).slice(
    0,
    VISIBLE_TRACKS,
  );

  return (
    <div className="space-y-2">
      <Searchbar
        ariaLabel={translate('searchLabel')}
        isDisabled={isDisabled}
        placeholder={translate('searchPlaceholder')}
        value={query}
        onSearch={setQuery}
      />
      {tracksQuery.isLoading ? (
        <Spinner />
      ) : tracksQuery.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {translate('loadFailed')}
        </p>
      ) : tracks.length === 0 ? (
        <p className="text-sm text-foreground/70">{translate('empty')}</p>
      ) : (
        <ul
          aria-label={translate(query ? 'results' : 'trending')}
          className="space-y-1"
        >
          {tracks.map((track) => (
            <li key={track.id}>
              <Button
                type="button"
                label={translate('attach', {
                  artist: artistOf(track),
                  title: track.title,
                })}
                variant={ButtonVariant.GHOST}
                isDisabled={isDisabled}
                onClick={() => onChoose(track)}
              />
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-foreground/60">{translate('licenseHint')}</p>
    </div>
  );
}
