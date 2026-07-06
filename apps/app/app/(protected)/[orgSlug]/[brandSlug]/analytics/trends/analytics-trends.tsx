'use client';

import HookRemixModal from '@pages/trends/list/components/HookRemixModal';
import {
  TrendingHashtags,
  TrendingSounds,
  ViralVideoLeaderboard,
} from '@ui/analytics/trends';
import Card from '@ui/card/Card';
import { useRouter } from 'next/navigation';
import {
  HiOutlineFire,
  HiOutlineHashtag,
  HiOutlineMusicalNote,
} from 'react-icons/hi2';
import CrossPlatformLeaderboardSection from './CrossPlatformLeaderboardSection';
import PlaybookSection from './PlaybookSection';
import TrendingTopicsSection from './TrendingTopicsSection';
import TrendsPageHeader from './TrendsPageHeader';
import { useAnalyticsTrends } from './useAnalyticsTrends';

export default function AnalyticsTrends() {
  const { push } = useRouter();
  const {
    PLATFORM_CONFIG_LOOKUP,
    TRENDS_PLATFORMS,
    creatorLeaderboard,
    formattedLastSyncedAt,
    handleHashtagClick,
    handleRemixClose,
    handleSoundClick,
    handleVideoClick,
    hashtagPlatform,
    isLoadingHashtags,
    isLoadingSounds,
    isLoadingTrends,
    isLoadingVideos,
    leadingPlatform,
    playbooks,
    remixVideo,
    setHashtagPlatform,
    setVideoTimeframe,
    totalTrackedTopics,
    trendingHashtags,
    trendingSounds,
    trendingTopics,
    videoTimeframe,
    viralLeaderboard,
    viralVideos,
  } = useAnalyticsTrends();

  return (
    <div className="space-y-8 pb-12">
      <TrendsPageHeader
        formattedLastSyncedAt={formattedLastSyncedAt}
        videoCount={viralVideos.length}
        platformCount={TRENDS_PLATFORMS.length}
        leadingPlatform={leadingPlatform}
        totalTrackedTopics={totalTrackedTopics}
      />

      {/* Trending Topics Section */}
      <section>
        <Card
          className="backdrop-blur"
          bodyClassName="space-y-6"
          label="Trending Topics"
          icon={HiOutlineFire}
        >
          <TrendingTopicsSection
            isLoadingTrends={isLoadingTrends}
            trendingTopics={trendingTopics}
            platformConfigLookup={PLATFORM_CONFIG_LOOKUP}
            onRowClick={(item) => push(`/analytics/trends/detail/${item.id}`)}
          />
        </Card>
      </section>

      {/* Viral Video Leaderboard Section */}
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

      {/* Trending Hashtags Section */}
      <section>
        <Card
          className="backdrop-blur"
          bodyClassName="space-y-6"
          label="Trending Hashtags"
          icon={HiOutlineHashtag}
        >
          <TrendingHashtags
            hashtags={trendingHashtags}
            isLoading={isLoadingHashtags}
            selectedPlatform={hashtagPlatform}
            onPlatformChange={setHashtagPlatform}
            onHashtagClick={handleHashtagClick}
          />
        </Card>
      </section>

      {/* Trending Sounds Section */}
      <section>
        <Card
          className="backdrop-blur"
          bodyClassName="space-y-6"
          label="Trending Sounds"
          icon={HiOutlineMusicalNote}
        >
          <TrendingSounds
            sounds={trendingSounds}
            isLoading={isLoadingSounds}
            onSoundClick={handleSoundClick}
          />
        </Card>
      </section>

      <CrossPlatformLeaderboardSection
        viralLeaderboard={viralLeaderboard}
        creatorLeaderboard={creatorLeaderboard}
        platformConfigLookup={PLATFORM_CONFIG_LOOKUP}
      />

      <PlaybookSection
        playbooks={playbooks}
        platformConfigLookup={PLATFORM_CONFIG_LOOKUP}
      />

      <HookRemixModal
        video={remixVideo}
        isOpen={remixVideo !== null}
        onClose={handleRemixClose}
      />
    </div>
  );
}
