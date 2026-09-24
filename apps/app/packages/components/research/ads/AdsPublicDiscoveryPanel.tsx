'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  AdsDiscoveryQuery,
  AdsDiscoveryResponse,
  CreateAdWatchedAdvertiserInput,
} from '@genfeedai/contracts/interfaces';
import { AdsPlatform } from '@genfeedai/contracts/interfaces';
import { publicAdYouTubeEmbedUrl } from '@genfeedai/integrations/ads';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOptionalDiscoveryRemix } from '@pages/research/remix/DiscoveryRemixProvider';
import { AdsResearchService } from '@services/ads/ads-research.service';
import Card from '@ui/card/Card';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { Button } from '@ui/primitives/button';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const EUROPE =
  'FR AT BE BG HR CY CZ DK EE FI DE GR HU IS IE IT LV LI LT LU MT NL NO PL PT RO SK SI ES SE CH GB'
    .split(' ')
    .sort();
const COUNTRIES = [
  ...new Set([
    'US',
    'CA',
    'AU',
    'NZ',
    'BR',
    'MX',
    'IN',
    'JP',
    'KR',
    'SG',
    'ZA',
    ...EUROPE,
  ]),
].sort();

export default function AdsPublicDiscoveryPanel({
  onWatch,
  isWatching,
  watchError,
}: {
  onWatch: (input: CreateAdWatchedAdvertiserInput) => Promise<boolean>;
  isWatching: boolean;
  watchError?: string;
}) {
  const translate = useTranslations('pages.adsResearch.discovery');
  const locale = useLocale();
  const remix = useOptionalDiscoveryRemix();
  const { brandId, isReady, organizationId } = useBrand();
  const getService = useAuthedService((token: string) =>
    AdsResearchService.getInstance(token),
  );
  const [keyword, setKeyword] = useState('');
  const [platform, setPlatform] = useState<AdsDiscoveryQuery['platform']>(
    AdsPlatform.META,
  );
  const [country, setCountry] = useState('all');
  const [mediaType, setMediaType] =
    useState<NonNullable<AdsDiscoveryQuery['mediaType']>>('visual');
  const [request, setRequest] = useState<
    AdsDiscoveryQuery & { nonce: number; organizationId: string }
  >();
  const [response, setResponse] = useState<AdsDiscoveryResponse>();
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [watched, setWatched] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    setResponse(undefined);
    setError(false);
    setLoading(false);
    setWatched([]);
    if (
      !request ||
      request.organizationId !== organizationId ||
      request.brandId !== (brandId || undefined) ||
      !isReady
    )
      return () => controller.abort();
    const run = async () => {
      setLoading(true);
      try {
        const service = await getService();
        if (controller.signal.aborted) return;
        const result = await service.discover(request, controller.signal);
        if (!controller.signal.aborted) setResponse(result);
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void run();
    return () => controller.abort();
  }, [request, brandId, organizationId, isReady, getService]);

  const current =
    request?.organizationId === organizationId &&
    request?.brandId === (brandId || undefined)
      ? response
      : undefined;
  const countries = platform === 'tiktok' ? EUROPE : COUNTRIES;
  return (
    <Card className="mb-4 bg-card/40" bodyClassName="gap-3 p-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">{translate('title')}</h2>
        <p className="text-xs text-foreground/60">{translate('description')}</p>
      </div>
      <Form
        spacing="none"
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setRequest({
            organizationId,
            brandId: brandId || undefined,
            keyword: keyword.trim(),
            platform,
            mediaType,
            countries: country === 'all' ? undefined : country,
            limit: 24,
            nonce: Date.now(),
          });
        }}
      >
        <Input
          aria-label={translate('queryLabel')}
          placeholder={translate(
            platform === 'google' || platform === 'youtube'
              ? 'googlePlaceholder'
              : 'keywordPlaceholder',
          )}
          value={keyword}
          minLength={2}
          maxLength={120}
          required
          onChange={(event) => setKeyword(event.target.value)}
          className="min-w-[220px] flex-1"
        />
        <Select
          value={platform}
          onValueChange={(value) => {
            setPlatform(value as AdsDiscoveryQuery['platform']);
            setCountry('all');
          }}
        >
          <SelectTrigger
            aria-label={translate('providerLabel')}
            className="w-[185px]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="meta">{translate('metaProvider')}</SelectItem>
            <SelectItem value="google">
              {translate('googleProvider')}
            </SelectItem>
            <SelectItem value="youtube">
              {translate('youtubeProvider')}
            </SelectItem>
            <SelectItem value="tiktok">
              {translate('tiktokProvider')}
            </SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={mediaType}
          onValueChange={(value) =>
            setMediaType(value as NonNullable<AdsDiscoveryQuery['mediaType']>)
          }
        >
          <SelectTrigger
            aria-label={translate('formatLabel')}
            className="w-[180px]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="visual">{translate('visualFormat')}</SelectItem>
            <SelectItem value="image">{translate('imageFormat')}</SelectItem>
            <SelectItem value="video">{translate('videoFormat')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={country} onValueChange={setCountry}>
          <SelectTrigger
            aria-label={translate('countryLabel')}
            className="w-[155px]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {translate(
                platform === 'tiktok' ? 'coveredRegions' : 'allCountries',
              )}
            </SelectItem>
            {countries.map((code) => (
              <SelectItem key={code} value={code}>
                {new Intl.DisplayNames([locale], { type: 'region' }).of(code) ??
                  code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="submit"
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          disabled={!isReady || loading || keyword.trim().length < 2}
        >
          {translate(loading ? 'searching' : 'search')}
        </Button>
      </Form>
      {platform === 'tiktok' ? (
        <p className="text-xs text-foreground/60">
          {translate('tiktokCoverage')}
        </p>
      ) : null}
      {watchError ? (
        <p role="alert" className="text-xs text-destructive">
          {watchError}
        </p>
      ) : null}
      <div role="status" aria-live="polite" className="text-xs">
        {error
          ? translate('failed')
          : current?.status === 'pending'
            ? translate('pending')
            : current?.status === 'empty'
              ? translate('empty')
              : current?.status === 'unsupported'
                ? translate('unsupported')
                : current?.status === 'unavailable'
                  ? translate('unavailable')
                  : null}
      </div>
      {current?.status === 'ready' ? (
        <>
          <p className="text-xs text-foreground/60">
            {translate('sampleNotice', { count: current.sampleCount })}
          </p>
          {!brandId ? (
            <p className="text-xs text-foreground/60">
              {translate('selectBrandToRemix')}
            </p>
          ) : null}
          <div className="space-y-4">
            {current.advertisers.map((advertiser) => (
              <div
                key={advertiser.id}
                className="rounded-md border border-border p-3 space-y-2"
              >
                <div className="flex justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">{advertiser.name}</h3>
                    <p className="text-xs text-foreground/60">
                      {advertiser.landingDomain ?? advertiser.handle}
                    </p>
                  </div>
                  <Button
                    size={ButtonSize.SM}
                    variant={ButtonVariant.SECONDARY}
                    disabled={
                      !advertiser.watchInput ||
                      isWatching ||
                      watched.includes(advertiser.id)
                    }
                    onClick={async () => {
                      if (advertiser.watchInput) {
                        if (await onWatch(advertiser.watchInput))
                          setWatched((previous) => [
                            ...previous,
                            advertiser.id,
                          ]);
                      }
                    }}
                  >
                    {translate(
                      watched.includes(advertiser.id) ? 'watching' : 'watch',
                    )}
                  </Button>
                </div>
                <p className="text-xs">
                  {translate('creativeCount', {
                    count: advertiser.creativeCount,
                  })}
                  {advertiser.activeCreativeCount !== undefined
                    ? ` · ${translate('activeCount', { count: advertiser.activeCreativeCount })}`
                    : ''}
                  {advertiser.longevityDays !== undefined
                    ? ` · ${translate('longevity', { days: advertiser.longevityDays })}`
                    : ''}
                </p>
                {advertiser.fundingEntity ? (
                  <p className="text-xs">
                    {translate('fundedBy', { name: advertiser.fundingEntity })}
                  </p>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {advertiser.samples.map((sample) => (
                    <div
                      key={sample.id}
                      className="min-w-0 space-y-2 rounded-md border border-border p-2"
                    >
                      {sample.imageUrls[0] ? (
                        <div className="relative h-28 overflow-hidden rounded-md">
                          <Image
                            src={sample.imageUrls[0]}
                            alt={sample.headline ?? advertiser.name}
                            fill
                            unoptimized
                            sizes="240px"
                            className="object-cover"
                          />
                        </div>
                      ) : null}
                      {sample.videoUrls[0] &&
                      publicAdYouTubeEmbedUrl(sample.videoUrls[0]) ? (
                        <iframe
                          src={publicAdYouTubeEmbedUrl(sample.videoUrls[0])}
                          title={translate('videoPreview')}
                          className="aspect-video w-full rounded-md border-0"
                          loading="lazy"
                          allow="encrypted-media; picture-in-picture; fullscreen"
                          allowFullScreen
                          referrerPolicy="strict-origin-when-cross-origin"
                        />
                      ) : sample.videoUrls[0] ? (
                        <VideoPlayer
                          src={sample.videoUrls[0]}
                          thumbnail={sample.imageUrls[0]}
                          mediaProps={{ poster: sample.imageUrls[0] }}
                          className="h-36 w-full overflow-hidden rounded-md"
                          ariaLabel={translate('videoPreview')}
                          config={{
                            autoPlay: false,
                            controls: true,
                            loop: false,
                            muted: false,
                            playsInline: true,
                            preload: 'none',
                          }}
                        />
                      ) : null}
                      {sample.mediaType === 'video' &&
                      !sample.videoUrls.length ? (
                        <p className="text-xs text-foreground/60">
                          {translate('videoPreviewUnavailable')}
                        </p>
                      ) : null}
                      {sample.headline ? (
                        <p className="line-clamp-2 text-xs">
                          {sample.headline}
                        </p>
                      ) : null}
                      <p className="text-xs text-foreground/60">
                        {translate(
                          sample.freshness === 'saved'
                            ? 'savedFreshness'
                            : sample.freshness === 'stale'
                              ? 'staleFreshness'
                              : 'unknownFreshness',
                        )}
                        {sample.observedAt &&
                        Number.isFinite(Date.parse(sample.observedAt)) &&
                        Date.parse(sample.observedAt) <= Date.now()
                          ? ` · ${translate('observedAt', { date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(sample.observedAt)) })}`
                          : ''}
                      </p>
                      <Button
                        size={ButtonSize.SM}
                        variant={ButtonVariant.SECONDARY}
                        disabled={
                          !brandId ||
                          !sample.adPerformanceId ||
                          sample.freshness !== 'saved' ||
                          !remix ||
                          remix.status === 'preparing'
                        }
                        onClick={() => {
                          if (
                            sample.adPerformanceId &&
                            sample.freshness === 'saved' &&
                            remix
                          ) {
                            void remix.openRemix({
                              kind: 'public_ad',
                              adPerformanceId: sample.adPerformanceId,
                            });
                          }
                        }}
                      >
                        {translate('remix')}
                      </Button>
                      {sample.archiveUrl ? (
                        <a
                          className="text-xs underline"
                          href={sample.archiveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {translate('viewCreative')}
                        </a>
                      ) : sample.mediaUrls[0] ? (
                        <a
                          className="text-xs underline"
                          href={sample.mediaUrls[0]}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {translate('viewMedia')}
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </Card>
  );
}
