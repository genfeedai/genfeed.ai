'use client';

import { getAppSignUpUrl } from '@data/app-links';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  IPublicYoutubeOutliersToolResult,
  IPublicYoutubeOutlierVideo,
} from '@genfeedai/contracts/interfaces';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import {
  WEBSITE_ANALYTICS_EVENTS,
  type WebsiteAnalyticsEventProperties,
} from '@website-src/analytics/analytics-events';
import { captureWebsiteAnalyticsEvent } from '@website-src/analytics/posthog-client';
import { loadPublicService } from '@website-src/api/load-public-service';
import { TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useEffect, useRef, useState } from 'react';

type OutliersEvent =
  | typeof WEBSITE_ANALYTICS_EVENTS.YOUTUBE_OUTLIERS_COMPLETED
  | typeof WEBSITE_ANALYTICS_EVENTS.YOUTUBE_OUTLIERS_SUBMITTED
  | typeof WEBSITE_ANALYTICS_EVENTS.YOUTUBE_OUTLIERS_VIEWED;

function captureOutliersEvent<E extends OutliersEvent>(
  event: E,
  properties: WebsiteAnalyticsEventProperties[E],
): void {
  captureWebsiteAnalyticsEvent(event, properties);
}

const compactNumber = new Intl.NumberFormat('en', {
  maximumFractionDigits: 1,
  notation: 'compact',
});

function tierLabel(video: IPublicYoutubeOutlierVideo): string {
  if (video.tier === 'breakout') {
    return 'Breakout';
  }
  return video.tier === 'outlier' ? 'Outlier' : 'Above average';
}

function statusMessage(
  result: IPublicYoutubeOutliersToolResult,
): string | null {
  if (result.status === 'insufficient_data') {
    return 'This channel has too few settled videos to know what a normal one looks like. It needs at least five videos older than two days.';
  }
  if (result.status === 'zero_baseline') {
    return 'The latest videos on this channel have no views to compare against.';
  }
  if (!result.outliers.some((video) => video.tier)) {
    return `No video is ${result.outlierThreshold}x above this channel's usual views. These came closest.`;
  }
  return null;
}

function OutlierRow({
  video,
}: {
  video: IPublicYoutubeOutlierVideo;
}): React.ReactElement {
  return (
    <li className="grid gap-4 bg-background p-4 shadow-border sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-center">
      {video.thumbnailUrl ? (
        // biome-ignore lint/performance/noImgElement: thumbnails come from YouTube's CDN, which next/image is not configured to optimize.
        <img
          alt=""
          className="aspect-video w-full object-cover sm:w-40"
          height={90}
          loading="lazy"
          src={video.thumbnailUrl}
          width={160}
        />
      ) : null}
      <div className="grid min-w-0 gap-1">
        <Link
          className="truncate text-sm font-semibold hover:underline"
          href={video.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          {video.title}
        </Link>
        <Text className="text-xs text-foreground/60">
          {compactNumber.format(video.views)} views ·{' '}
          {new Date(video.publishedAt).toLocaleDateString('en', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </Text>
      </div>
      <div className="grid gap-0.5 sm:text-right">
        <Text className="text-2xl font-semibold tabular-nums">
          {video.ratio}x
        </Text>
        <Text className="text-xs uppercase tracking-label text-foreground/60">
          {tierLabel(video)}
        </Text>
      </div>
    </li>
  );
}

export default function YoutubeOutliersContent(): React.ReactElement {
  const [channel, setChannel] = useState('');
  const [result, setResult] = useState<IPublicYoutubeOutliersToolResult | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewedRef = useRef(false);

  // use-effect-audit: ignore sends one analytics event when the tool is first viewed
  useEffect(() => {
    if (viewedRef.current) {
      return;
    }
    viewedRef.current = true;
    captureOutliersEvent(WEBSITE_ANALYTICS_EVENTS.YOUTUBE_OUTLIERS_VIEWED, {
      surface: 'youtube_outliers',
    });
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || !channel.trim()) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setResult(null);
    captureOutliersEvent(WEBSITE_ANALYTICS_EVENTS.YOUTUBE_OUTLIERS_SUBMITTED, {
      surface: 'youtube_outliers',
    });

    try {
      const found = await (await loadPublicService()).findPublicYoutubeOutliers(
        channel.trim(),
      );
      setResult(found);
      captureOutliersEvent(
        WEBSITE_ANALYTICS_EVENTS.YOUTUBE_OUTLIERS_COMPLETED,
        { outcome: 'ready', status: found.status },
      );
    } catch {
      setError(
        'This channel could not be read. Paste a channel URL such as youtube.com/@name, an @handle or a channel ID, and try again in a few minutes if it keeps failing.',
      );
      captureOutliersEvent(
        WEBSITE_ANALYTICS_EVENTS.YOUTUBE_OUTLIERS_COMPLETED,
        { outcome: 'failed' },
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const message = result ? statusMessage(result) : null;

  return (
    <section className="container mx-auto grid gap-10 px-6 py-20 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid gap-8">
        <Form
          spacing="section"
          className="bg-background p-5 shadow-border sm:p-6"
          aria-label="YouTube outlier finder"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <Field
            description="A channel URL, an @handle or a channel ID. We read the latest 100 public videos and compare each with the channel's usual views."
            label="YouTube channel"
          >
            <Input
              autoComplete="off"
              maxLength={200}
              onChange={(event) => setChannel(event.target.value)}
              placeholder="https://www.youtube.com/@channel"
              type="text"
              value={channel}
            />
          </Field>

          {error ? (
            <Text className="text-sm text-destructive" role="alert">
              {error}
            </Text>
          ) : null}

          <Button
            ariaLabel="Find outlier videos"
            isDisabled={!channel.trim() || isSubmitting}
            isLoading={isSubmitting}
            label={isSubmitting ? 'Reading the channel…' : 'Find outliers'}
            size={ButtonSize.PUBLIC}
            type="submit"
            withWrapper={false}
          />
        </Form>

        {result ? (
          <div aria-live="polite" className="grid gap-5">
            <div className="grid gap-1">
              <Heading as="h2">{result.channelTitle ?? 'This channel'}</Heading>
              {result.baselineViews !== null ? (
                <Text className="text-sm text-foreground/70">
                  A usual video here gets about{' '}
                  {compactNumber.format(result.baselineViews)} views (median of
                  the latest {result.baselineSampleSize}).{' '}
                  {result.videosAnalyzed} videos read.
                </Text>
              ) : null}
            </div>
            {message ? (
              <Text className="text-sm leading-6 text-foreground/70">
                {message}
              </Text>
            ) : null}
            {result.outliers.length > 0 ? (
              <ol className="grid gap-3">
                {result.outliers.map((video) => (
                  <OutlierRow key={video.videoId} video={video} />
                ))}
              </ol>
            ) : null}
            <div className="grid gap-3 bg-foreground/5 p-4">
              <Text className="text-sm leading-6 text-foreground/70">
                Found one worth copying? Genfeed turns a winning idea into your
                own post, image or video, in your brand.
              </Text>
              <Button
                asChild
                size={ButtonSize.PUBLIC}
                variant={ButtonVariant.SECONDARY}
                withWrapper={false}
              >
                <Link href={getAppSignUpUrl()}>Remix it in Genfeed</Link>
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <aside className="h-fit bg-background p-6 shadow-border">
        <TrendingUp aria-hidden="true" className="size-5" />
        <Heading as="h2" className="mt-4 text-lg">
          How outliers are found
        </Heading>
        <Text className="mt-3 text-sm leading-6 text-foreground/70">
          A video's views are divided by the median views of the channel's
          latest 20 videos that are at least two days old. 3x or more is an
          outlier and 10x or more a breakout. Shorts and long videos are ranked
          together, and views are read live from YouTube.
        </Text>
      </aside>
    </section>
  );
}
