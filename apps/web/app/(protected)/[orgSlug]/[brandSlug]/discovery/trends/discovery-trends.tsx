'use client';

import { Timeframe } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import SectionTopbar from '@ui/layout/section-topbar/SectionTopbar';
import SubbarControls from '@ui/layout/subbar-controls/SubbarControls';
import { Flame } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  TrendingHashtags,
  TrendingSounds,
} from '@/components/analytics/trends';
import TrendVideoGallery from '@/components/analytics/trends/trend-video-gallery';
import FilterMenu from '@/components/content/filter-menu/FilterMenu';
import HookRemixModal from '@/features/trends/list/components/HookRemixModal';
import { SocialsNavigation } from '@/features/trends/shared/socials-navigation';

import TrendingTopicsSection from './TrendingTopicsSection';
import TrendsPageHeader from './TrendsPageHeader';
import { useDiscoveryTrends } from './useDiscoveryTrends';

export default function DiscoveryTrends() {
  const { href } = useOrgUrl();
  const translate = useTranslations('pages.analytics.trends.page');
  const discovery = useTranslations('ui.discovery');
  const {
    PLATFORM_CONFIG_LOOKUP,
    TRENDS_PLATFORMS,
    corpusHealth,
    relevance,
    setRelevance,
    selectedHashtag,
    setSelectedHashtag,
    error,
    reload,
    formattedLastSyncedAt,
    handleRemixClose,
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
        icon={Flame}
        tabs={<SocialsNavigation active="overview" />}
        refresh={
          <ButtonRefresh
            onClick={() => {
              void reload();
            }}
          />
        }
        actions={
          <SubbarControls
            filters={
              <FilterMenu
                facets={[
                  {
                    defaultValue: 'brand',
                    key: 'relevance',
                    label: discovery('relevance'),
                    onChange: (value) => {
                      if (value === 'brand' || value === 'market') {
                        setRelevance(value);
                      }
                    },
                    options: [
                      { label: discovery('brand'), value: 'brand' },
                      { label: discovery('market'), value: 'market' },
                    ],
                    selection: 'single',
                    value: relevance,
                  },
                  {
                    defaultValue: 'all',
                    key: 'platform',
                    label: discovery('platformFilter'),
                    onChange: (value) =>
                      setHashtagPlatform(value === 'all' ? '' : value),
                    options: [
                      { label: discovery('allPlatforms'), value: 'all' },
                      ...TRENDS_PLATFORMS.map(({ id, label }) => ({
                        label,
                        value: id,
                      })),
                    ],
                    selection: 'single',
                    value: hashtagPlatform || 'all',
                  },
                  {
                    defaultValue: Timeframe.H72,
                    key: 'timeframe',
                    label: discovery('timeframeFilter'),
                    onChange: (value) => {
                      if (
                        value === Timeframe.H24 ||
                        value === Timeframe.H72 ||
                        value === Timeframe.D7
                      ) {
                        setVideoTimeframe(value);
                      }
                    },
                    options: [
                      { label: discovery('hours24'), value: Timeframe.H24 },
                      { label: discovery('hours72'), value: Timeframe.H72 },
                      { label: discovery('days7'), value: Timeframe.D7 },
                    ],
                    selection: 'single',
                    value: videoTimeframe,
                  },
                ]}
                onClear={() => {
                  setRelevance('brand');
                  setHashtagPlatform('');
                  setVideoTimeframe(Timeframe.H72);
                }}
              />
            }
          />
        }
      />

      <Container bodyClassName="space-y-8" moduleChrome={false}>
        <p className="text-sm text-muted-foreground">
          {relevance === 'brand'
            ? discovery('brandDescription')
            : discovery('marketDescription')}
        </p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {discovery('loadError')}
          </p>
        ) : null}
        <TrendsPageHeader
          corpusScope={relevance === 'market' ? 'global' : 'all'}
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
                href: href(`${APP_ROUTES.DISCOVERY.TRENDS}/detail/${item.id}`),
                label: `Open ${item.topic}`,
              })}
            />
          </Card>
        </section>

        <section>
          <TrendVideoGallery
            selectedHashtag={selectedHashtag}
            onClearHashtag={() => setSelectedHashtag('')}
            videos={viralVideos}
            isLoading={isLoadingVideos}
            timeframe={videoTimeframe}
            onVideoClick={handleVideoClick}
          />
        </section>

        <section>
          <TrendingHashtags
            onHashtagClick={(hashtag) =>
              setSelectedHashtag(hashtag.hashtag.replace(/^#/, ''))
            }
            hashtags={trendingHashtags}
            isLoading={isLoadingHashtags}
            selectedPlatform={hashtagPlatform}
          />
        </section>

        <section>
          <TrendingSounds sounds={trendingSounds} isLoading={isLoadingSounds} />
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
