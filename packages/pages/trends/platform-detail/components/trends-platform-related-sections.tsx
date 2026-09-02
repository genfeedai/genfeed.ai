'use client';

import type {
  ITrendHashtag,
  ITrendSound,
  ITrendVideo,
} from '@genfeedai/contracts/interfaces';
import {
  type AuthorizedResearchFinding,
  isSameResearchFindingReference,
  type ResearchFindingReference,
  toTrendHashtagFinding,
  toTrendSoundFinding,
  toTrendVideoFinding,
} from '@pages/research/work-surface/research-work-surface.types';
import { Film, Hash, Music } from 'lucide-react';
import type { ReactNode } from 'react';

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
  selectedReference?: ResearchFindingReference | null;
  onSelect?: (finding: AuthorizedResearchFinding) => void;
};

function SectionHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {icon}
      <h2 className="text-base font-semibold tracking-[-0.01em] text-foreground">
        {title}
      </h2>
    </div>
  );
}

function EmptyBlock({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-card bg-background px-4 py-6 text-sm text-muted-foreground shadow-border">
      {children}
    </div>
  );
}

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
  selectedReference,
  onSelect,
}: TrendsPlatformRelatedSectionsProps) {
  return (
    <>
      {showVideos ? (
        <section className="space-y-3">
          <SectionHeader
            title="Related viral videos"
            icon={<Film className="size-4 text-muted-foreground" />}
          />
          {isLoadingVideos ? (
            <p className="py-3 text-sm text-muted-foreground">
              Loading viral videos…
            </p>
          ) : viralVideos.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {viralVideos.map((video: ITrendVideo) => {
                const finding = toTrendVideoFinding(video);
                return (
                  <RelatedMetricCard
                    badgeValue={video.viralScore}
                    detail={
                      video.creatorHandle ? `@${video.creatorHandle}` : null
                    }
                    finding={finding}
                    isSelected={isSameResearchFindingReference(
                      selectedReference ?? null,
                      finding.reference,
                    )}
                    key={video.id}
                    onSelect={onSelect}
                    title={video.title || video.hook || 'Untitled'}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyBlock>No viral videos available right now.</EmptyBlock>
          )}
        </section>
      ) : null}

      {showHashtags ? (
        <section className="space-y-3">
          <SectionHeader
            title="Trending hashtags"
            icon={<Hash className="size-4 text-muted-foreground" />}
          />
          {isLoadingHashtags ? (
            <p className="py-3 text-sm text-muted-foreground">
              Loading hashtags…
            </p>
          ) : hashtags.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {hashtags.map((hashtag: ITrendHashtag) => {
                const finding = toTrendHashtagFinding(hashtag);
                return (
                  <RelatedMetricCard
                    badgeValue={hashtag.viralityScore}
                    detail={
                      hashtag.platform ? hashtag.platform.toLowerCase() : null
                    }
                    finding={finding}
                    isSelected={isSameResearchFindingReference(
                      selectedReference ?? null,
                      finding.reference,
                    )}
                    key={hashtag.id || hashtag.hashtag}
                    onSelect={onSelect}
                    title={hashtag.hashtag}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyBlock>No trending hashtags available right now.</EmptyBlock>
          )}
        </section>
      ) : null}

      {showSounds ? (
        <section className="space-y-3">
          <SectionHeader
            title="Trending sounds"
            icon={<Music className="size-4 text-muted-foreground" />}
          />
          {isLoadingSounds ? (
            <p className="py-3 text-sm text-muted-foreground">
              Loading sounds…
            </p>
          ) : sounds.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sounds.map((sound: ITrendSound) => {
                const finding = toTrendSoundFinding(sound);
                return (
                  <RelatedMetricCard
                    badgeValue={sound.viralityScore}
                    detail={
                      sound.platform ? sound.platform.toLowerCase() : null
                    }
                    finding={finding}
                    isSelected={isSameResearchFindingReference(
                      selectedReference ?? null,
                      finding.reference,
                    )}
                    key={sound.soundId}
                    onSelect={onSelect}
                    title={sound.soundName || 'Untitled sound'}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyBlock>No trending sounds available right now.</EmptyBlock>
          )}
        </section>
      ) : null}
    </>
  );
}
