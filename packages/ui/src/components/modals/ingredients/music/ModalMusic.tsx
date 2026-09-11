'use client';

import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
  ModalEnum,
} from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type { IMusic } from '@genfeedai/contracts/interfaces';
import { closeModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { ModalMusicProps } from '@genfeedai/props/modals/modal.props';
import { logger } from '@genfeedai/services/core/logger.service';
import { MusicsService } from '@genfeedai/services/ingredients/musics.service';
import Loading from '@ui/loading/default/Loading';
import ModalActions from '@ui/modals/actions/ModalActions';
import ModalGalleryItemMusic from '@ui/modals/gallery/items/ModalGalleryItemMusic';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import { Music as MusicIcon, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface MusicSelectionOverride {
  sourceId: string;
  value: string;
}

export default function ModalMusic({
  brandId,
  selectedMusicId,
  onConfirm,
}: ModalMusicProps) {
  const [selectionOverride, setSelectionOverride] =
    useState<MusicSelectionOverride | null>(null);
  const [availableMusic, setAvailableMusic] = useState<IMusic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const selectedMusic =
    selectionOverride?.sourceId === selectedMusicId
      ? selectionOverride.value
      : selectedMusicId;

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
  }, [findAllMusics]);

  const closeModalMusic = () => {
    setSelectionOverride(null);
    closeModal(ModalEnum.MUSIC);
  };

  const handleConfirm = () => {
    const music = selectedMusic
      ? availableMusic.find((track) => track.id === selectedMusic) || null
      : null;

    onConfirm(music);
    closeModalMusic();
  };

  const handleClearSelection = () => {
    setSelectionOverride({ sourceId: selectedMusicId, value: '' });
  };

  return (
    <Modal id={ModalEnum.MUSIC} title="Select Background Music">
      <div className="flex max-w-5xl flex-col gap-4">
        <div className="flex items-center justify-between">
          <Button
            ariaLabel="Close"
            label={<X className="text-lg" />}
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
            <MusicIcon className="text-5xl text-foreground/20 mx-auto mb-3" />
            <p className="text-foreground/60">
              No music tracks available. Generate some music first.
            </p>
          </div>
        ) : (
          <>
            {/* Music Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto p-1">
              {availableMusic.map((music) => (
                <ModalGalleryItemMusic
                  key={music.id}
                  music={music}
                  isSelected={selectedMusic === music.id}
                  onSelect={(track) =>
                    setSelectionOverride({
                      sourceId: selectedMusicId,
                      value: track.id,
                    })
                  }
                />
              ))}
            </div>

            {/* No Music Option */}
            <div className="pt-3 border-t border-white/[0.08]">
              <Button
                className={`p-3 transition-[box-shadow,background-color] cursor-pointer ${
                  !selectedMusic
                    ? 'shadow-border-strong bg-primary/5'
                    : 'shadow-border hover:shadow-border-strong'
                }`}
                onClick={handleClearSelection}
                type="button"
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
              >
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-full bg-muted flex items-center justify-center">
                    <X className="text-foreground/50" />
                  </div>
                  <div>
                    <p className="font-medium">No Background Music</p>
                    <p className="text-xs text-foreground/60">
                      Merge without audio track
                    </p>
                  </div>
                </div>
              </Button>
            </div>
          </>
        )}

        <ModalActions>
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
