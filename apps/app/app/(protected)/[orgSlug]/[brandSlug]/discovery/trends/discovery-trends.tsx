'use client';

import { ButtonSize, ButtonVariant, Timeframe } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import HookRemixModal from '@pages/trends/list/components/HookRemixModal';
import { SocialsNavigation } from '@pages/trends/shared/socials-navigation';
import { TrendingHashtags, TrendingSounds } from '@ui/analytics/trends';
import TrendVideoGallery from '@ui/analytics/trends/trend-video-gallery';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import SectionTopbar from '@ui/layout/section-topbar/SectionTopbar';
import Tabs from '@ui/navigation/tabs/Tabs';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Flame } from 'lucide-react';
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
          <Tabs
            activeTab={relevance}
            ariaLabel={discovery('relevance')}
            fullWidth={false}
            items={[
              { id: 'brand', label: discovery('brand') },
              { id: 'market', label: discovery('market') },
            ]}
            onTabChange={(value) => {
              if (value === 'brand' || value === 'market') setRelevance(value);
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={hashtagPlatform || 'all'}
              onValueChange={(value) =>
                setHashtagPlatform(value === 'all' ? '' : value)
              }
            >
              <SelectTrigger
                aria-label={discovery('platformFilter')}
                className="w-40"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{discovery('allPlatforms')}</SelectItem>
                {TRENDS_PLATFORMS.map(({ id, label }) => (
                  <SelectItem key={id} value={id}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={videoTimeframe}
              onValueChange={(value) => {
                if (
                  value === Timeframe.H24 ||
                  value === Timeframe.H72 ||
                  value === Timeframe.D7
                )
                  setVideoTimeframe(value);
              }}
            >
              <SelectTrigger
                aria-label={discovery('timeframeFilter')}
                className="w-36"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={Timeframe.H24}>
                  {discovery('hours24')}
                </SelectItem>
                <SelectItem value={Timeframe.H72}>
                  {discovery('hours72')}
                </SelectItem>
                <SelectItem value={Timeframe.D7}>
                  {discovery('days7')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
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
