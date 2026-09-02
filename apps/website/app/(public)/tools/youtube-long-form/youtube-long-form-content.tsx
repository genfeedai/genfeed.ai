'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  IPublicYoutubeLongFormToolResult,
  PublicYoutubeLongFormOutputType,
} from '@genfeedai/contracts/interfaces';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { YoutubeLongFormService } from '@services/content/youtube-long-form.service';
import { EnvironmentService } from '@services/core/environment.service';
import { PublicService } from '@services/external/public.service';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import PageLayout from '@web-components/PageLayout';
import { FileText, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  WEBSITE_ANALYTICS_EVENTS,
  type WebsiteAnalyticsEventProperties,
} from '../../../../packages/analytics/analytics-events';
import { captureWebsiteAnalyticsEvent } from '../../../../packages/analytics/posthog-client';

const OUTPUT_OPTIONS: ReadonlyArray<{
  description: string;
  label: string;
  value: PublicYoutubeLongFormOutputType;
}> = [
  {
    description: 'Editorial long-form with clear sections and a conclusion.',
    label: 'Article',
    value: 'article',
  },
  {
    description: 'Professional, insight-led writing for LinkedIn Articles.',
    label: 'LinkedIn article',
    value: 'linkedin-article',
  },
  {
    description: 'A sharp thesis and compact sections for X Articles.',
    label: 'X article',
    value: 'x-article',
  },
  {
    description: 'A complete issue with sections, takeaways, and a CTA.',
    label: 'Newsletter',
    value: 'newsletter',
  },
];

type LongFormEvent =
  | typeof WEBSITE_ANALYTICS_EVENTS.YOUTUBE_LONG_FORM_COMPLETED
  | typeof WEBSITE_ANALYTICS_EVENTS.YOUTUBE_LONG_FORM_SUBMITTED
  | typeof WEBSITE_ANALYTICS_EVENTS.YOUTUBE_LONG_FORM_VIEWED;

function captureLongFormEvent<E extends LongFormEvent>(
  event: E,
  properties: WebsiteAnalyticsEventProperties[E],
): void {
  captureWebsiteAnalyticsEvent(event, properties);
}

const createYoutubeLongFormService = (token: string) =>
  YoutubeLongFormService.getInstance(token);

export default function YoutubeLongFormContent(): React.ReactElement {
  const { isSignedIn } = useAuthIdentity();
  const getAuthenticatedService = useAuthedService(
    createYoutubeLongFormService,
  );
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [outputType, setOutputType] =
    useState<PublicYoutubeLongFormOutputType>('article');
  const [result, setResult] = useState<IPublicYoutubeLongFormToolResult | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingSource, setIsSavingSource] = useState(false);
  const [savedSourceId, setSavedSourceId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewedRef = useRef(false);

  useEffect(() => {
    if (viewedRef.current) {
      return;
    }
    viewedRef.current = true;
    captureLongFormEvent(WEBSITE_ANALYTICS_EVENTS.YOUTUBE_LONG_FORM_VIEWED, {
      surface: 'youtube_long_form',
    });
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || !youtubeUrl.trim()) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setResult(null);
    setCopied(false);
    setSavedSourceId(null);
    captureLongFormEvent(WEBSITE_ANALYTICS_EVENTS.YOUTUBE_LONG_FORM_SUBMITTED, {
      outputType,
    });

    try {
      const generated = isSignedIn
        ? await (await getAuthenticatedService()).create(
            youtubeUrl.trim(),
            outputType,
          )
        : await PublicService.getInstance().createPublicYoutubeLongForm(
            youtubeUrl.trim(),
            outputType,
          );
      setResult(generated);
      captureLongFormEvent(
        WEBSITE_ANALYTICS_EVENTS.YOUTUBE_LONG_FORM_COMPLETED,
        { outcome: 'ready', outputType },
      );
    } catch {
      setError(
        'This video could not be transformed. Use a public YouTube video with spoken audio and try again.',
      );
      captureLongFormEvent(
        WEBSITE_ANALYTICS_EVENTS.YOUTUBE_LONG_FORM_COMPLETED,
        { outcome: 'failed', outputType },
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyResult = async () => {
    if (!result) {
      return;
    }
    await navigator.clipboard.writeText(
      `# ${result.title}\n\n${result.summary}\n\n${result.content}`,
    );
    setCopied(true);
  };

  const saveSourceToLibrary = async () => {
    if (!result?.sourceArtifactId || isSavingSource) {
      return;
    }
    setIsSavingSource(true);
    setError(null);
    try {
      const saved = await (
        await getAuthenticatedService()
      ).promoteSourceToLibrary(result.sourceArtifactId);
      setSavedSourceId(saved.ingredientId);
    } catch {
      setError(
        'The source could not be saved. It remains available temporarily, so please try again.',
      );
    } finally {
      setIsSavingSource(false);
    }
  };

  return (
    <PageLayout
      badge="Free AI tool"
      badgeIcon={FileText}
      compact
      description="Paste a public YouTube video once, reuse its transcript, and turn it into a publish-ready article or newsletter."
      title="YouTube to long-form text"
    >
      <section className="container mx-auto grid gap-10 px-6 py-20 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-8">
          <form
            aria-label="YouTube to long-form text"
            className="grid gap-6 bg-background p-5 shadow-border sm:p-6"
            onSubmit={(event) => void handleSubmit(event)}
          >
            <Field
              description="Public YouTube videos with spoken audio only. One workflow resolves, transcribes, and transforms your selected format into a copyable preview."
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

            <fieldset className="grid gap-3">
              <legend className="text-sm font-semibold">Output format</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {OUTPUT_OPTIONS.map((option) => (
                  <div className="grid gap-2" key={option.value}>
                    <Button
                      ariaLabel={`Select ${option.label}`}
                      label={option.label}
                      onClick={() => setOutputType(option.value)}
                      size={ButtonSize.PUBLIC}
                      type="button"
                      variant={
                        outputType === option.value
                          ? ButtonVariant.DEFAULT
                          : ButtonVariant.SECONDARY
                      }
                      withWrapper={false}
                    />
                    <Text className="text-xs leading-5 text-surface/60">
                      {option.description}
                    </Text>
                  </div>
                ))}
              </div>
            </fieldset>

            {error ? (
              <Text className="text-sm text-destructive" role="alert">
                {error}
              </Text>
            ) : null}

            <Button
              ariaLabel="Transform YouTube video"
              isDisabled={!youtubeUrl.trim() || isSubmitting}
              isLoading={isSubmitting}
              label={isSubmitting ? 'Writing long-form text…' : 'Create text'}
              size={ButtonSize.PUBLIC}
              type="submit"
              withWrapper={false}
            />
          </form>

          {isSubmitting ? (
            <div
              aria-live="polite"
              className="grid gap-2 bg-background p-6 shadow-border"
            >
              <Text className="text-sm font-semibold">
                Resolving, transcribing, and writing…
              </Text>
              <Text className="text-sm text-surface/60">
                Long videos take longer. Keep this tab open while the workflow
                completes.
              </Text>
            </div>
          ) : null}

          {result ? (
            <article className="grid gap-5 bg-background p-6 shadow-border">
              <div className="grid gap-2">
                <Text className="text-xs font-semibold uppercase tracking-wider text-surface/55">
                  {OUTPUT_OPTIONS.find(
                    (option) => option.value === result.outputType,
                  )?.label ?? result.outputType}
                </Text>
                <Heading as="h2">{result.title}</Heading>
                <Text className="text-sm leading-6 text-surface/65">
                  {result.summary}
                </Text>
              </div>
              <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-surface/85">
                {result.content}
              </pre>
              <Button
                ariaLabel="Copy generated long-form text"
                label={copied ? 'Copied' : 'Copy text'}
                onClick={() => void copyResult()}
                size={ButtonSize.PUBLIC}
                variant={ButtonVariant.SECONDARY}
                withWrapper={false}
              />
              {result.sourceArtifactId ? (
                <Button
                  ariaLabel="Save YouTube source to Library"
                  isDisabled={Boolean(savedSourceId) || isSavingSource}
                  isLoading={isSavingSource}
                  label={
                    savedSourceId ? 'Source saved' : 'Save source to Library'
                  }
                  onClick={() => void saveSourceToLibrary()}
                  size={ButtonSize.PUBLIC}
                  withWrapper={false}
                />
              ) : (
                <div className="grid gap-3 bg-fill/[0.04] p-4">
                  <Text className="text-sm leading-6 text-surface/65">
                    Sign in before your next run to save the generated text and
                    optionally keep the source video in your Library.
                  </Text>
                  <Button
                    asChild
                    size={ButtonSize.PUBLIC}
                    variant={ButtonVariant.SECONDARY}
                    withWrapper={false}
                  >
                    <Link href={`${EnvironmentService.apps.app}/login`}>
                      Sign in to save future results
                    </Link>
                  </Button>
                </div>
              )}
            </article>
          ) : null}
        </div>

        <aside className="h-fit bg-background p-6 shadow-border">
          <Sparkles aria-hidden="true" className="size-5" />
          <Heading as="h2" className="mt-4 text-lg">
            One transcript, four formats
          </Heading>
          <Text className="mt-3 text-sm leading-6 text-surface/65">
            Every format uses the same source and transcription actions. Only
            the selected output is generated. Signed-in results are saved;
            temporary media expires unless you explicitly keep the source in
            your Library.
          </Text>
        </aside>
      </section>
    </PageLayout>
  );
}
