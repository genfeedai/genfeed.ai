'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import HookRemixModal from '@pages/trends/list/components/HookRemixModal';
import { SocialsNavigation } from '@pages/trends/shared/socials-navigation';
import { TrendingHashtags, TrendingSounds } from '@ui/analytics/trends';
import TrendVideoGallery from '@ui/analytics/trends/trend-video-gallery';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import SectionTopbar from '@ui/layout/section-topbar/SectionTopbar';
import { Button } from '@ui/primitives/button';
import { Flame, Hash, Music } from 'lucide-react';
import { useTranslations } from 'next-intl';

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
        subtitle={translate('subtitle')}
        icon={Flame}
        tabs={<SocialsNavigation active="overview" />}
      />

      <Container bodyClassName="space-y-8" moduleChrome={false}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <fieldset className="flex gap-1" aria-label={discovery('relevance')}>
            {(
              [
                { value: 'market', label: discovery('market') },
                { value: 'brand', label: discovery('brand') },
              ] as const
            ).map((option) => (
              <Button
                key={option.value}
                size={ButtonSize.SM}
                aria-pressed={relevance === option.value}
                variant={
                  relevance === option.value
                    ? ButtonVariant.SECONDARY
                    : ButtonVariant.GHOST
                }
                onClick={() => setRelevance(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </fieldset>
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.SM}
            onClick={() => {
              void reload();
            }}
          >
            {discovery('reload')}
          </Button>
        </div>
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
          <Card className="backdrop-blur" bodyClassName="space-y-6">
            <TrendVideoGallery
              selectedHashtag={selectedHashtag}
              onClearHashtag={() => setSelectedHashtag('')}
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
              onHashtagClick={(hashtag) =>
                setSelectedHashtag(hashtag.hashtag.replace(/^#/, ''))
              }
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
