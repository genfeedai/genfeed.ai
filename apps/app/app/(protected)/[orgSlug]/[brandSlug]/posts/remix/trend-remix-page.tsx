'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant, CredentialPlatform } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { PostsService } from '@services/content/posts.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { Button } from '@ui/primitives/button';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

function buildTwitterRemixTopic(params: {
  sourceAuthor?: string;
  sourceText?: string;
  sourceUrl?: string;
  topic?: string;
}): string {
  const parts = [
    params.topic ? `Trend: ${params.topic}.` : undefined,
    params.sourceAuthor
      ? `Remix inspiration from @${params.sourceAuthor}.`
      : undefined,
    params.sourceText ? `Source content: ${params.sourceText}` : undefined,
    params.sourceUrl ? `Source URL: ${params.sourceUrl}.` : undefined,
    'Write an original Twitter/X draft for my brand inspired by this source, not copied from it.',
  ];

  return parts.filter(Boolean).join(' ');
}

export default function TrendRemixPage() {
  const router = useRouter();
  const { orgHref } = useOrgUrl();
  const searchParams = useSearchParams();
  const { credentials, isReady } = useBrand();
  const hasStartedRef = useRef(false);
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const getPostsService = useAuthedService((token: string) =>
    PostsService.getInstance(token),
  );

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(true);

  const mode = searchParams.get('mode') === 'thread' ? 'thread' : 'tweet';
  const topic = searchParams.get('topic')?.trim() || '';
  const trendId = searchParams.get('trendId')?.trim() || '';
  const sourceReferenceId = searchParams.get('sourceReferenceId')?.trim() || '';
  const sourceText = searchParams.get('sourceText')?.trim() || '';
  const sourceAuthor = searchParams.get('sourceAuthor')?.trim() || '';
  const sourceUrl = searchParams.get('sourceUrl')?.trim() || '';

  const twitterCredential = useMemo(
    () =>
      credentials.find(
        (credential) => credential.platform === CredentialPlatform.TWITTER,
      ),
    [credentials],
  );

  useEffect(() => {
    if (!isReady || hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;

    if (!twitterCredential?.id) {
      const nextError = 'Connect a Twitter/X account for this brand first.';
      setError(nextError);
      setIsSubmitting(false);
      notificationsService.error(nextError);
      return;
    }

    const remixTopic = buildTwitterRemixTopic({
      sourceAuthor,
      sourceText,
      sourceUrl,
      topic,
    });

    const run = async () => {
      try {
        const postsService = await getPostsService();

        if (mode === 'thread') {
          await postsService.generateThread({
            count: 5,
            credential: twitterCredential.id,
            sourceReferenceIds: sourceReferenceId
              ? [sourceReferenceId]
              : undefined,
            sourceUrl: sourceUrl || undefined,
            tone: 'professional',
            topic: remixTopic,
            trendId: trendId || undefined,
          });
        } else {
          await postsService.generateTweets({
            count: 1,
            credential: twitterCredential.id,
            sourceReferenceIds: sourceReferenceId
              ? [sourceReferenceId]
              : undefined,
            sourceUrl: sourceUrl || undefined,
            tone: 'professional',
            topic: remixTopic,
            trendId: trendId || undefined,
          });
        }

        notificationsService.success(
          mode === 'thread'
            ? 'Thread remix draft created'
            : 'Tweet remix draft created',
        );
        router.replace('/posts?platform=twitter');
      } catch (runError) {
        logger.error('Failed to create trend remix draft', runError);
        setError('Failed to create the remix draft.');
        setIsSubmitting(false);
        notificationsService.error('Failed to create the remix draft.');
      }
    };

    run().catch(() => {
      /* handled above */
    });
  }, [
    getPostsService,
    isReady,
    mode,
    notificationsService,
    router,
    sourceAuthor,
    sourceReferenceId,
    sourceText,
    sourceUrl,
    topic,
    trendId,
    twitterCredential?.id,
  ]);

  if (isSubmitting) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-primary" />
          <p className="mt-4 text-sm text-foreground/70">
            Creating your Twitter remix draft...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-6">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold">Unable to create remix draft</h1>
        <p className="text-sm text-foreground/70">
          {error || 'Something went wrong while creating the remix draft.'}
        </p>
        <div className="flex justify-center gap-3">
          <Button
            label="Go to Drafts"
            variant={ButtonVariant.SECONDARY}
            onClick={() => router.push('/posts?platform=twitter')}
          />
          <Button
            label="Go to Credentials"
            variant={ButtonVariant.OUTLINE}
            onClick={() => router.push(orgHref('/settings/api-keys'))}
          />
        </div>
      </div>
    </div>
  );
}
