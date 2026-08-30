'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type {
  IPublicYoutubeClipRecommendation,
  IPublicYoutubeClipToolSession,
} from '@genfeedai/interfaces';
import { PublicService } from '@services/external/public.service';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import PageLayout from '@web-components/PageLayout';
import { Clock3, Scissors, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  WEBSITE_ANALYTICS_EVENTS,
  type WebsiteAnalyticsEventProperties,
} from '../../../../packages/analytics/analytics-events';
import { captureWebsiteAnalyticsEvent } from '../../../../packages/analytics/posthog-client';
import { buildAuthHandoffHref } from '../../../../packages/auth/auth-handoff';

const POLL_INTERVAL_MS = 2_000;

type YoutubeClipEvent =
  | typeof WEBSITE_ANALYTICS_EVENTS.YOUTUBE_CLIP_ANALYSIS_COMPLETED
  | typeof WEBSITE_ANALYTICS_EVENTS.YOUTUBE_CLIP_AUTH_HANDOFF
  | typeof WEBSITE_ANALYTICS_EVENTS.YOUTUBE_CLIP_PREVIEW_COMPLETED
  | typeof WEBSITE_ANALYTICS_EVENTS.YOUTUBE_CLIP_PREVIEW_REQUESTED
  | typeof WEBSITE_ANALYTICS_EVENTS.YOUTUBE_CLIP_TOOL_SUBMITTED
  | typeof WEBSITE_ANALYTICS_EVENTS.YOUTUBE_CLIP_TOOL_VIEWED;

function captureYoutubeClipEvent<E extends YoutubeClipEvent>(
  event: E,
  properties: WebsiteAnalyticsEventProperties[E],
): void {
  captureWebsiteAnalyticsEvent(event, properties);
}

function formatTimestamp(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainder = wholeSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function RecommendationCard({
  disabled,
  index,
  onPreview,
  recommendation,
}: {
  readonly disabled: boolean;
  readonly index: number;
  readonly onPreview: () => void;
  readonly recommendation: IPublicYoutubeClipRecommendation;
}): React.ReactElement {
  return (
    <article className="grid gap-4 bg-background p-5 shadow-border">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Text className="text-xs font-semibold uppercase tracking-wider text-surface/55">
            Clip {index + 1} · {recommendation.clipType}
          </Text>
          <Heading as="h3" className="mt-2 text-lg">
            {recommendation.title}
          </Heading>
        </div>
        <span className="shrink-0 text-xs font-semibold text-surface/65">
          {formatTimestamp(recommendation.startTime)}–
          {formatTimestamp(recommendation.endTime)}
        </span>
      </div>
      <Text className="text-sm leading-6 text-surface/65">
        {recommendation.summary}
      </Text>
      <div className="flex flex-wrap gap-2">
        {recommendation.tags.slice(0, 4).map((tag) => (
          <span
            className="bg-fill/[0.05] px-2 py-1 text-xs text-surface/65"
            key={tag}
          >
            {tag}
          </span>
        ))}
      </div>
      <Button
        ariaLabel={`Generate free preview for ${recommendation.title}`}
        isDisabled={disabled}
        label="Generate free preview"
        onClick={onPreview}
        size={ButtonSize.PUBLIC}
        variant={ButtonVariant.SECONDARY}
        withWrapper={false}
      />
    </article>
  );
}

export default function YoutubeClipsContent(): React.ReactElement {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [session, setSession] = useState<IPublicYoutubeClipToolSession | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewedRef = useRef(false);
  const analysisOutcomeRef = useRef<'failed' | 'ready' | null>(null);
  const previewOutcomeRef = useRef<'failed' | 'ready' | null>(null);
  const authCapturedRef = useRef(new Set<'sign_in' | 'sign_up'>());

  useEffect(() => {
    if (viewedRef.current) {
      return;
    }
    viewedRef.current = true;
    captureYoutubeClipEvent(WEBSITE_ANALYTICS_EVENTS.YOUTUBE_CLIP_TOOL_VIEWED, {
      surface: 'youtube_clips',
    });
  }, []);

  useEffect(() => {
    if (!session?.previewToken) {
      return;
    }
    const shouldPoll =
      ['analyzing', 'queued'].includes(session.status) ||
      ['generating', 'queued'].includes(session.preview.status);
    if (!shouldPoll) {
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      PublicService.getInstance()
        .getPublicYoutubeClip(session.previewToken)
        .then((nextSession) => {
          if (!cancelled) {
            setSession(nextSession);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setError(
              'We could not refresh this result. Retrying automatically.',
            );
          }
        });
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [session]);

  useEffect(() => {
    if (!session || !['failed', 'ready'].includes(session.status)) {
      return;
    }
    const outcome = session.status as 'failed' | 'ready';
    if (analysisOutcomeRef.current === outcome) {
      return;
    }
    analysisOutcomeRef.current = outcome;
    captureYoutubeClipEvent(
      WEBSITE_ANALYTICS_EVENTS.YOUTUBE_CLIP_ANALYSIS_COMPLETED,
      { outcome },
    );
  }, [session]);

  useEffect(() => {
    if (!session || !['failed', 'ready'].includes(session.preview.status)) {
      return;
    }
    const outcome = session.preview.status as 'failed' | 'ready';
    if (previewOutcomeRef.current === outcome) {
      return;
    }
    previewOutcomeRef.current = outcome;
    captureYoutubeClipEvent(
      WEBSITE_ANALYTICS_EVENTS.YOUTUBE_CLIP_PREVIEW_COMPLETED,
      { outcome },
    );
  }, [session]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || !youtubeUrl.trim()) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setSession(null);
    analysisOutcomeRef.current = null;
    previewOutcomeRef.current = null;
    captureYoutubeClipEvent(
      WEBSITE_ANALYTICS_EVENTS.YOUTUBE_CLIP_TOOL_SUBMITTED,
      { surface: 'youtube_clips' },
    );
    try {
      const nextSession =
        await PublicService.getInstance().createPublicYoutubeClip(
          youtubeUrl.trim(),
          crypto.randomUUID(),
        );
      setSession(nextSession);
    } catch {
      setError(
        'Use a public, available YouTube video URL. Private and unsupported sources are rejected before processing.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const requestPreview = async (
    recommendation: IPublicYoutubeClipRecommendation,
    index: number,
  ) => {
    if (!session) {
      return;
    }
    setError(null);
    captureYoutubeClipEvent(
      WEBSITE_ANALYTICS_EVENTS.YOUTUBE_CLIP_PREVIEW_REQUESTED,
      { recommendationRank: (index + 1) as 1 | 2 | 3 },
    );
    try {
      setSession(
        await PublicService.getInstance().requestPublicYoutubeClipPreview(
          session.previewToken,
          recommendation.id,
        ),
      );
    } catch {
      setError('The free preview could not be started. Please try again.');
    }
  };

  const captureAuthHandoff = (authMode: 'sign_in' | 'sign_up') => {
    if (authCapturedRef.current.has(authMode)) {
      return;
    }
    authCapturedRef.current.add(authMode);
    captureYoutubeClipEvent(
      WEBSITE_ANALYTICS_EVENTS.YOUTUBE_CLIP_AUTH_HANDOFF,
      { authMode },
    );
  };

  const previewLocked = session?.preview.status !== 'available';
  const previewInFlight =
    session?.preview.status === 'generating' ||
    session?.preview.status === 'queued';

  return (
    <PageLayout
      badge="Free AI tool"
      badgeIcon={Scissors}
      compact
      description="Paste a public YouTube URL. Get a timestamped transcript, three AI-selected short-form moments, and one rendered preview before signup."
      title="YouTube transcript to clips"
    >
      <section className="container mx-auto grid gap-10 px-6 py-20 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-8">
          <form
            aria-label="YouTube transcript to clips"
            className="grid gap-4 bg-background p-5 shadow-border sm:p-6"
            onSubmit={(event) => void handleSubmit(event)}
          >
            <Field
              description="Public YouTube videos only. Usage is rate-limited and duplicate submissions reuse the same temporary result."
              label="YouTube URL"
            >
              <Input
                autoComplete="url"
                maxLength={2048}
                onChange={(event) => setYoutubeUrl(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                type="url"
                value={youtubeUrl}
              />
            </Field>
            {error ? (
              <Text className="text-sm text-destructive" role="alert">
                {error}
              </Text>
            ) : null}
            <Button
              ariaLabel="Analyze YouTube video"
              isDisabled={!youtubeUrl.trim() || isSubmitting}
              isLoading={isSubmitting}
              label="Find my clips"
              size={ButtonSize.PUBLIC}
              type="submit"
              withWrapper={false}
            />
          </form>

          {session && ['analyzing', 'queued'].includes(session.status) ? (
            <div
              aria-live="polite"
              className="grid gap-3 bg-background p-6 shadow-border"
            >
              <Text className="text-sm font-semibold">
                Analyzing transcript and clip moments…
              </Text>
              <div
                aria-label={`${session.progress}% complete`}
                className="h-1 overflow-hidden bg-fill/[0.08]"
                role="progressbar"
              >
                <div
                  className="h-full bg-surface transition-[width]"
                  style={{ width: `${Math.max(2, session.progress)}%` }}
                />
              </div>
            </div>
          ) : null}

          {session?.status === 'failed' ? (
            <Text className="bg-background p-6 text-sm text-destructive shadow-border">
              This video could not be analyzed. Try another public YouTube
              video.
            </Text>
          ) : null}

          {session?.status === 'ready' ? (
            <>
              <section className="grid gap-4" aria-labelledby="clip-results">
                <div>
                  <Heading as="h2" id="clip-results">
                    Three moments worth clipping
                  </Heading>
                  <Text className="mt-2 text-sm text-surface/65">
                    Choose once: this free session renders one preview clip.
                  </Text>
                </div>
                <div className="grid gap-4">
                  {session.recommendations.map((recommendation, index) => (
                    <RecommendationCard
                      disabled={previewLocked}
                      index={index}
                      key={recommendation.id}
                      onPreview={() =>
                        void requestPreview(recommendation, index)
                      }
                      recommendation={recommendation}
                    />
                  ))}
                </div>
              </section>

              <section className="grid gap-4" aria-labelledby="transcript">
                <Heading as="h2" id="transcript">
                  Timestamped transcript
                </Heading>
                <div className="max-h-[34rem] overflow-y-auto bg-background p-5 shadow-border">
                  <ol className="grid gap-3">
                    {session.transcript.map((segment) => (
                      <li
                        className="grid grid-cols-[4.5rem_1fr] gap-3 text-sm"
                        key={`${segment.start}-${segment.end}`}
                      >
                        <span className="font-mono text-xs text-surface/55">
                          {formatTimestamp(segment.start)}
                        </span>
                        <span className="leading-6 text-surface/75">
                          {segment.text}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </section>
            </>
          ) : null}
        </div>

        <aside className="grid content-start gap-5">
          <div className="grid gap-4 bg-background p-6 shadow-border">
            <Sparkles aria-hidden="true" className="size-5" />
            <Heading as="h2" className="text-lg">
              Free session includes
            </Heading>
            <ul className="grid gap-3 text-sm leading-6 text-surface/65">
              <li>Full timestamped transcript</li>
              <li>Three ranked clip recommendations</li>
              <li>One rendered vertical preview</li>
            </ul>
            <Text className="text-xs leading-5 text-surface/55">
              <Clock3 aria-hidden="true" className="mr-1 inline size-3" />
              Temporary results expire automatically. The source URL and media
              are never sent to product analytics.
            </Text>
          </div>

          {session?.preview.status === 'generating' ||
          session?.preview.status === 'queued' ? (
            <div aria-live="polite" className="bg-background p-6 shadow-border">
              <Text className="text-sm font-semibold">
                Rendering your preview…
              </Text>
            </div>
          ) : null}

          {session?.preview.status === 'failed' ? (
            <Text className="bg-background p-6 text-sm text-destructive shadow-border">
              Preview rendering failed. Your transcript and recommendations are
              still available until this session expires.
            </Text>
          ) : null}

          {session?.preview.status === 'ready' && session.preview.url ? (
            <div className="grid gap-4 bg-background p-5 shadow-border">
              <Heading as="h2" className="text-lg">
                Your free preview
              </Heading>
              <video
                className="aspect-[9/16] w-full bg-black object-contain"
                controls
                data-ph-no-capture
                src={session.preview.url}
              >
                <track kind="captions" />
              </video>
            </div>
          ) : null}

          {session?.status === 'ready' ? (
            <div className="grid gap-3 bg-background p-6 shadow-border">
              <Heading as="h2" className="text-lg">
                Make the rest in Studio
              </Heading>
              <Text className="text-sm leading-6 text-surface/65">
                Create a workspace to keep this transcript, recommendations, and
                preview as a real Studio Clips project.
              </Text>
              {previewInFlight ? (
                <Text className="text-sm leading-6 text-surface/65">
                  Finish rendering this preview before continuing so it is saved
                  with the Studio project.
                </Text>
              ) : (
                <>
                  <Button asChild size={ButtonSize.PUBLIC} withWrapper={false}>
                    <Link
                      data-ph-no-capture
                      href={buildAuthHandoffHref(
                        'sign-up',
                        'clipToolToken',
                        session.previewToken,
                      )}
                      onClick={() => captureAuthHandoff('sign_up')}
                    >
                      Create workspace and continue
                    </Link>
                  </Button>
                  <Button
                    asChild
                    size={ButtonSize.PUBLIC}
                    variant={ButtonVariant.SECONDARY}
                    withWrapper={false}
                  >
                    <Link
                      data-ph-no-capture
                      href={buildAuthHandoffHref(
                        'login',
                        'clipToolToken',
                        session.previewToken,
                      )}
                      onClick={() => captureAuthHandoff('sign_in')}
                    >
                      Sign in and continue
                    </Link>
                  </Button>
                </>
              )}
            </div>
          ) : null}
        </aside>
      </section>
    </PageLayout>
  );
}
