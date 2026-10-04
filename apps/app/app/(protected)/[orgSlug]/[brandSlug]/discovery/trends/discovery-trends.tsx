'use client';

import HookRemixModal from '@pages/trends/list/components/HookRemixModal';
import { SocialsNavigation } from '@pages/trends/shared/socials-navigation';
import {
  TrendingHashtags,
  TrendingSounds,
  ViralVideoLeaderboard,
} from '@ui/analytics/trends';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import SectionTopbar from '@ui/layout/section-topbar/SectionTopbar';
import { Flame, Hash, Music } from 'lucide-react';
import { useTranslations } from 'next-intl';

import TrendingTopicsSection from './TrendingTopicsSection';
import TrendsPageHeader from './TrendsPageHeader';
import { useDiscoveryTrends } from './useDiscoveryTrends';

export default function DiscoveryTrends() {
  const translate = useTranslations('pages.analytics.trends.page');
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

  // Same composition as the per-platform drilldowns: the platform switcher
  // lives in the module bar and the body gets the shared page inset.
  return (
    <>
      <SectionTopbar
        title={translate('heading')}
        subtitle={translate('subtitle')}
        icon={Flame}
        tabs={<SocialsNavigation active="overview" />}
      />

      <Container bodyClassName="space-y-8">
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
            label={translate('trendingTopics')}
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
            label={translate('trendingHashtags')}
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
            label={translate('trendingSounds')}
            icon={Music}
          >
            <TrendingSounds
              sounds={trendingSounds}
              isLoading={isLoadingSounds}
              onSoundClick={handleSoundClick}
            />
          </Card>
        </section>
      </Container>

      <HookRemixModal
        video={remixVideo}
        isOpen={remixVideo !== null}
        onClose={handleRemixClose}
      />
    </>
  );
}
