'use client';

import { ViewType } from '@genfeedai/contracts';
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
import CollectionView from '@ui/collection/CollectionView';
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

const RELATED_SKELETON_COUNT = 3;

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
  // Metric tiles are grid-only, so the list renderer is never reached.
  function renderVideo(video: ITrendVideo) {
    const finding = toTrendVideoFinding(video);
    return (
      <RelatedMetricCard
        badgeValue={video.viralScore}
        detail={video.creatorHandle ? `@${video.creatorHandle}` : null}
        finding={finding}
        isSelected={isSameResearchFindingReference(
          selectedReference ?? null,
          finding.reference,
        )}
        onSelect={onSelect}
        title={video.title || video.hook || 'Untitled'}
      />
    );
  }

  function renderHashtag(hashtag: ITrendHashtag) {
    const finding = toTrendHashtagFinding(hashtag);
    return (
      <RelatedMetricCard
        badgeValue={hashtag.viralityScore}
        detail={hashtag.platform ? hashtag.platform.toLowerCase() : null}
        finding={finding}
        isSelected={isSameResearchFindingReference(
          selectedReference ?? null,
          finding.reference,
        )}
        onSelect={onSelect}
        title={hashtag.hashtag}
      />
    );
  }

  function renderSound(sound: ITrendSound) {
    const finding = toTrendSoundFinding(sound);
    return (
      <RelatedMetricCard
        badgeValue={sound.viralityScore}
        detail={sound.platform ? sound.platform.toLowerCase() : null}
        finding={finding}
        isSelected={isSameResearchFindingReference(
          selectedReference ?? null,
          finding.reference,
        )}
        onSelect={onSelect}
        title={sound.soundName || 'Untitled sound'}
      />
    );
  }

  return (
    <>
      {showVideos ? (
        <section className="space-y-3">
          <SectionHeader
            title="Related viral videos"
            icon={<Film className="size-4 text-muted-foreground" />}
          />
          <CollectionView
            data-testid="trends-related-videos-grid"
            density="tile"
            emptyState={
              <EmptyBlock>No viral videos available right now.</EmptyBlock>
            }
            getItemKey={(video) => video.id}
            isLoading={isLoadingVideos}
            items={viralVideos}
            maxColumns={3}
            renderGridItem={renderVideo}
            renderListItem={renderVideo}
            skeletonCount={RELATED_SKELETON_COUNT}
            view={ViewType.GRID}
          />
        </section>
      ) : null}

      {showHashtags ? (
        <section className="space-y-3">
          <SectionHeader
            title="Trending hashtags"
            icon={<Hash className="size-4 text-muted-foreground" />}
          />
          <CollectionView
            data-testid="trends-related-hashtags-grid"
            density="tile"
            emptyState={
              <EmptyBlock>No trending hashtags available right now.</EmptyBlock>
            }
            getItemKey={(hashtag) => hashtag.id || hashtag.hashtag}
            isLoading={isLoadingHashtags}
            items={hashtags}
            maxColumns={3}
            renderGridItem={renderHashtag}
            renderListItem={renderHashtag}
            skeletonCount={RELATED_SKELETON_COUNT}
            view={ViewType.GRID}
          />
        </section>
      ) : null}

      {showSounds ? (
        <section className="space-y-3">
          <SectionHeader
            title="Trending sounds"
            icon={<Music className="size-4 text-muted-foreground" />}
          />
          <CollectionView
            data-testid="trends-related-sounds-grid"
            density="tile"
            emptyState={
              <EmptyBlock>No trending sounds available right now.</EmptyBlock>
            }
            getItemKey={(sound) => sound.soundId}
            isLoading={isLoadingSounds}
            items={sounds}
            maxColumns={3}
            renderGridItem={renderSound}
            renderListItem={renderSound}
            skeletonCount={RELATED_SKELETON_COUNT}
            view={ViewType.GRID}
          />
        </section>
      ) : null}
    </>
  );
}
