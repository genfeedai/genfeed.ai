'use client';

import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
  ModalEnum,
} from '@genfeedai/enums';
import type { IMetadata } from '@genfeedai/interfaces';
import { closeModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Music } from '@models/ingredients/music.model';
import type { ModalMusicProps } from '@props/modals/modal.props';
import { logger } from '@services/core/logger.service';
import { MusicsService } from '@services/ingredients/musics.service';
import Loading from '@ui/loading/default/Loading';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import { useCallback, useEffect, useState } from 'react';
import { HiMusicalNote, HiPause, HiPlay, HiXMark } from 'react-icons/hi2';

export default function ModalMusic({
  brandId,
  selectedMusicId,
  onConfirm,
}: ModalMusicProps) {
  const [selectedMusic, setSelectedMusic] = useState<string>(selectedMusicId);
  const [availableMusic, setAvailableMusic] = useState<Music[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string>('');
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(
    null,
  );

  const getMusicsService = useAuthedService((token: string) =>
    MusicsService.getInstance(token),
  );

  const findAllMusics = useCallback(async () => {
    setIsLoading(true);

    try {
      const service = (await getMusicsService()) as MusicsService;
      const data = await service.findAll({
        brand: brandId,
        limit: ITEMS_PER_PAGE * 4,
        sort: 'createdAt: -1',
        type: IngredientCategory.MUSIC,
      });

      logger.info('Loaded available music', data);
      setAvailableMusic(data);
    } catch (error) {
      logger.error('Failed to load music', error);
      setAvailableMusic([]);
    } finally {
      setIsLoading(false);
    }
  }, [brandId, getMusicsService]);

  useEffect(() => {
    findAllMusics();

    return () => {
      // Clean up audio on unmount
      if (audioElement) {
        audioElement.pause();
        audioElement.src = '';
      }
    };
  }, [audioElement, findAllMusics]);

  const handlePlayPause = (musicId: string, musicUrl: string) => {
    if (playingId === musicId) {
      // Pause current
      if (audioElement) {
        audioElement.pause();
      }
      setPlayingId('');
    } else {
      // Play new
      if (audioElement) {
        audioElement.pause();
      }

      const audio = new Audio(musicUrl);
      audio.play();
      audio.onended = () => setPlayingId('');
      setAudioElement(audio);
      setPlayingId(musicId);
    }
  };

  const closeModalMusic = () => {
    if (audioElement) {
      audioElement.pause();
    }
    closeModal(ModalEnum.MUSIC);
  };

  const handleConfirm = () => {
    if (audioElement) {
      audioElement.pause();
    }

    const music = selectedMusic
      ? availableMusic.find((music: Music) => music.id === selectedMusic) ||
        null
      : null;

    onConfirm(music);
    closeModalMusic();
  };

  const handleClearSelection = () => {
    setSelectedMusic('');
  };

  return (
    <Modal id={ModalEnum.MUSIC} title="Select Background Music">
      <div className="max-w-5xl">
        <div className="flex items-center justify-between mb-4">
          <Button
            label={<HiXMark className="text-lg" />}
            onClick={closeModalMusic}
            variant={ButtonVariant.GHOST}
            size={ButtonSize.ICON}
            className="rounded-full"
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loading isFullSize={false} />
          </div>
        ) : availableMusic.length === 0 ? (
          <div className="text-center py-12">
            <HiMusicalNote className="text-5xl text-foreground/20 mx-auto mb-3" />
            <p className="text-foreground/60">
              No music tracks available. Generate some music first.
            </p>
          </div>
        ) : (
          <>
            {/* Music Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto p-1">
              {availableMusic.map((music: Music) => {
                const metadata =
                  typeof music.metadata === 'object' && music.metadata
                    ? (music.metadata as IMetadata)
                    : null;
                const metadataLabel = metadata?.label;

                return (
                  <div
                    key={music.id}
                    className={`relative p-4 border-2 transition-all cursor-pointer group ${
                      selectedMusic === music.id
                        ? 'border-primary bg-primary/5'
                        : 'border-white/[0.08] hover:border-primary/50 bg-background'
                    }`}
                    onClick={() => setSelectedMusic(music.id)}
                  >
                    {/* Music Icon */}
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center ${
                          selectedMusic === music.id
                            ? 'bg-primary/20'
                            : 'bg-muted'
                        }`}
                      >
                        <HiMusicalNote
                          className={`text-xl ${
                            selectedMusic === music.id
                              ? 'text-primary'
                              : 'text-foreground/50'
                          }`}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium truncate">
                          {metadataLabel || `Track ${music.id.slice(0, 8)}`}
                        </h4>

                        {music.metadataDuration && (
                          <p className="text-xs text-foreground/60">
                            {Math.floor(music.metadataDuration / 60)}:
                            {String(music.metadataDuration % 60).padStart(
                              2,
                              '0',
                            )}
                          </p>
                        )}
                      </div>

                      {/* Play/Pause Button */}
                      <Button
                        variant={ButtonVariant.GHOST}
                        size={ButtonSize.ICON}
                        className="rounded-full"
                        label={
                          playingId === music.id ? <HiPause /> : <HiPlay />
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayPause(music.id, music.ingredientUrl);
                        }}
                      />
                    </div>

                    {/* Selected Badge */}
                    {selectedMusic === music.id && (
                      <div className="absolute top-2 right-2">
                        <div className="w-2 h-2 bg-primary rounded-full"></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* No Music Option */}
            <div className="mt-3 pt-3 border-t border-white/[0.08]">
              <div
                className={`p-3 border-2 transition-all cursor-pointer ${
                  !selectedMusic
                    ? 'border-primary bg-primary/5'
                    : 'border-white/[0.08] hover:border-primary/50'
                }`}
                onClick={handleClearSelection}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <HiXMark className="text-foreground/50" />
                  </div>
                  <div>
                    <p className="font-medium">No Background Music</p>
                    <p className="text-xs text-foreground/60">
                      Merge without audio track
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        <ModalActions className="mt-6">
          <Button
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            onClick={closeModalMusic}
          />

          <Button
            variant={ButtonVariant.DEFAULT}
            onClick={handleConfirm}
            label={
              selectedMusic ? 'Use Selected Music' : 'Continue Without Music'
            }
          />
        </ModalActions>
      </div>
    </Modal>
  );
}
