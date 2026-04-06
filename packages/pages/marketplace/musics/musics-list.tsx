'use client';

import {
  GALLERY_EMPTY_MESSAGES,
  GALLERY_EMPTY_SIZE,
  GALLERY_GRID_CLASS,
} from '@genfeedai/constants';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { IMetadata } from '@genfeedai/interfaces';
import { useGalleryList } from '@hooks/data/gallery/use-gallery-list/use-gallery-list';
import type { Music } from '@models/ingredients/music.model';
import { EnvironmentService } from '@services/core/environment.service';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Loading from '@ui/loading/default/Loading';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { HiMusicalNote, HiPause, HiPlay } from 'react-icons/hi2';

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
}

function getMetadata(music: Music): IMetadata | null {
  if (typeof music.metadata === 'object' && music.metadata) {
    return music.metadata as IMetadata;
  }
  return null;
}

export default function MusicsList(): ReactNode {
  const router = useRouter();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { items: musics, isLoading } = useGalleryList<Music>({
    includeStatusFilter: false,
    type: 'musics',
  });

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  function handlePlayPause(musicId: string): void {
    if (playingId === musicId) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    audioRef.current?.pause();

    const audio = new Audio(
      `${EnvironmentService.apiEndpoint}/public/musics/${musicId}/audio.mp3`,
    );
    audio.play();
    audio.onended = () => setPlayingId(null);

    audioRef.current = audio;
    setPlayingId(musicId);
  }

  if (isLoading) {
    return <Loading isFullSize={false} />;
  }

  return (
    <>
      {musics.length === 0 ? (
        <CardEmpty
          icon={HiMusicalNote}
          label={GALLERY_EMPTY_MESSAGES.musics.label}
          description={GALLERY_EMPTY_MESSAGES.musics.description}
          action={{
            label: 'Create Music',
            onClick: () => router.push('/studio'),
          }}
          size={GALLERY_EMPTY_SIZE}
        />
      ) : (
        <div className={GALLERY_GRID_CLASS}>
          {musics.map((music) => {
            const metadata = getMetadata(music);
            const isPlaying = playingId === music.id;

            return (
              <Card
                key={music.id}
                className="p-6 hover:shadow-lg transition-shadow duration-300"
              >
                <div className="flex flex-col items-center space-y-4">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-background rounded-full flex items-center justify-center">
                    <HiMusicalNote className="text-3xl text-primary" />
                  </div>
                  <div className="text-center flex-1">
                    <h3 className="font-semibold truncate max-w-full">
                      {metadata?.label || 'Untitled'}
                    </h3>
                    {metadata?.duration && (
                      <p className="text-sm text-foreground/50 mt-1">
                        {formatDuration(metadata.duration)}
                      </p>
                    )}
                  </div>
                  <Button
                    withWrapper={false}
                    variant={ButtonVariant.DEFAULT}
                    size={ButtonSize.ICON}
                    className="rounded-full"
                    onClick={() => handlePlayPause(music.id)}
                    ariaLabel={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? (
                      <HiPause className="text-xl" />
                    ) : (
                      <HiPlay className="text-xl" />
                    )}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-4">
        <AutoPagination />
      </div>
    </>
  );
}
