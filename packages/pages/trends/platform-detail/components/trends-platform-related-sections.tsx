'use client';

import type {
  ITrendHashtag,
  ITrendSound,
  ITrendVideo,
} from '@genfeedai/interfaces';
import { HiHashtag, HiMusicalNote, HiOutlineFilm } from 'react-icons/hi2';
import RelatedMetricCard from './related-metric-card';

type TrendsPlatformRelatedSectionsProps = {
  showVideos: boolean;
  isLoadingVideos: boolean;
  viralVideos: ITrendVideo[];

  showHashtags: boolean;
  isLoadingHashtags: boolean;
  hashtags: ITrendHashtag[];

  showSounds: boolean;
  isLoadingSounds: boolean;
  sounds: ITrendSound[];
};

export default function TrendsPlatformRelatedSections({
  showVideos,
  isLoadingVideos,
  viralVideos,
  showHashtags,
  isLoadingHashtags,
  hashtags,
  showSounds,
  isLoadingSounds,
  sounds,
}: TrendsPlatformRelatedSectionsProps) {
  return (
    <>
      {showVideos ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <HiOutlineFilm className="size-5 text-foreground/70" />
            <h2 className="text-lg font-semibold text-foreground">
              Related viral videos
            </h2>
          </div>
          {isLoadingVideos ? (
            <div className="py-3 text-sm text-foreground/40">
              Loading viral videos…
            </div>
          ) : viralVideos.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {viralVideos.map((video: ITrendVideo) => (
                <RelatedMetricCard
                  badgeValue={video.viralScore}
                  detail={
                    video.creatorHandle ? `@${video.creatorHandle}` : null
                  }
                  key={video.id}
                  title={video.title || video.hook || 'Untitled'}
                />
              ))}
            </div>
          ) : (
            <div className="py-3 text-sm text-foreground/40">
              No viral videos available right now.
            </div>
          )}
        </section>
      ) : null}

      {showHashtags ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <HiHashtag className="size-5 text-foreground/70" />
            <h2 className="text-lg font-semibold text-foreground">
              Trending hashtags
            </h2>
          </div>
          {isLoadingHashtags ? (
            <div className="py-3 text-sm text-foreground/40">
              Loading hashtags…
            </div>
          ) : hashtags.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {hashtags.map((hashtag: ITrendHashtag) => (
                <RelatedMetricCard
                  badgeValue={hashtag.viralityScore}
                  detail={
                    hashtag.platform ? hashtag.platform.toLowerCase() : null
                  }
                  key={hashtag.id || hashtag.hashtag}
                  title={hashtag.hashtag}
                />
              ))}
            </div>
          ) : (
            <div className="py-3 text-sm text-foreground/40">
              No trending hashtags available right now.
            </div>
          )}
        </section>
      ) : null}

      {showSounds ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <HiMusicalNote className="size-5 text-foreground/70" />
            <h2 className="text-lg font-semibold text-foreground">
              Trending sounds
            </h2>
          </div>
          {isLoadingSounds ? (
            <div className="py-3 text-sm text-foreground/40">
              Loading sounds…
            </div>
          ) : sounds.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {sounds.map((sound: ITrendSound) => (
                <RelatedMetricCard
                  badgeValue={sound.viralityScore}
                  detail={sound.platform ? sound.platform.toLowerCase() : null}
                  key={sound.soundId}
                  title={sound.soundName || 'Untitled sound'}
                />
              ))}
            </div>
          ) : (
            <div className="py-3 text-sm text-foreground/40">
              No trending sounds available right now.
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}
