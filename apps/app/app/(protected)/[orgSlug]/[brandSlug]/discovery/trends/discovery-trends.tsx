'use client';

import HookRemixModal from '@pages/trends/list/components/HookRemixModal';
import {
  TrendingHashtags,
  TrendingSounds,
  ViralVideoLeaderboard,
} from '@ui/analytics/trends';
import Card from '@ui/card/Card';
import { Flame, Hash, Music } from 'lucide-react';

import TrendingTopicsSection from './TrendingTopicsSection';
import TrendsPageHeader from './TrendsPageHeader';
import { useDiscoveryTrends } from './useDiscoveryTrends';

export default function DiscoveryTrends() {
  const {
    PLATFORM_CONFIG_LOOKUP,
    TRENDS_PLATFORMS,
    corpusHealth,
    formattedLastSyncedAt,
    handleRemixClose,
    handleSoundClick,
    handleVideoClick,
    hashtagPlatform,
    isCorpusHealthUnavailable,
    isLoadingHashtags,
    isLoadingSounds,
    isLoadingTrends,
    isLoadingVideos,
    leadingPlatform,
    remixVideo,
    setHashtagPlatform,
    setVideoTimeframe,
    totalTrackedTopics,
    trendingHashtags,
    trendingSounds,
    trendingTopics,
    videoTimeframe,
    viralVideos,
  } = useDiscoveryTrends();

  return (
    <div className="space-y-8 pb-12">
      <TrendsPageHeader
        corpusHealth={corpusHealth}
        formattedLastSyncedAt={formattedLastSyncedAt}
        isCorpusHealthUnavailable={isCorpusHealthUnavailable}
        videoCount={viralVideos.length}
        platformCount={TRENDS_PLATFORMS.length}
        leadingPlatform={leadingPlatform}
        totalTrackedTopics={totalTrackedTopics}
      />

      <section>
        <Card
          className="backdrop-blur"
          bodyClassName="space-y-6"
          label="Trending Topics"
          icon={Flame}
        >
          <TrendingTopicsSection
            isLoadingTrends={isLoadingTrends}
            trendingTopics={trendingTopics}
            platformConfigLookup={PLATFORM_CONFIG_LOOKUP}
            getRowLink={(item) => ({
              href: `/discovery/trends/detail/${item.id}`,
              label: `Open ${item.topic}`,
            })}
          />
        </Card>
      </section>

      <section>
        <Card className="backdrop-blur" bodyClassName="space-y-6">
          <ViralVideoLeaderboard
            videos={viralVideos}
            isLoading={isLoadingVideos}
            timeframe={videoTimeframe}
            onTimeframeChange={setVideoTimeframe}
            onVideoClick={handleVideoClick}
          />
        </Card>
      </section>

      <section>
        <Card
          className="backdrop-blur"
          bodyClassName="space-y-6"
          label="Trending Hashtags"
          icon={Hash}
        >
          <TrendingHashtags
            hashtags={trendingHashtags}
            isLoading={isLoadingHashtags}
            selectedPlatform={hashtagPlatform}
            onPlatformChange={setHashtagPlatform}
          />
        </Card>
      </section>

      <section>
        <Card
          className="backdrop-blur"
          bodyClassName="space-y-6"
          label="Trending Sounds"
          icon={Music}
        >
          <TrendingSounds
            sounds={trendingSounds}
            isLoading={isLoadingSounds}
            onSoundClick={handleSoundClick}
          />
        </Card>
      </section>

      <HookRemixModal
        video={remixVideo}
        isOpen={remixVideo !== null}
        onClose={handleRemixClose}
      />
    </div>
  );
}
