'use client';

import { APP_ROUTES, sourcePostVariationCredits } from '@genfeedai/constants';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type {
  GenerateSourcePostVariationsInput,
  IPostVariationResult,
} from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { PostsService } from '@services/content/posts.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import {
  ErrorHandler,
  getErrorStatus,
  type IAxiosLikeError,
} from '@utils/error/error-handler.util';
import { isSourcePostVariationPlatform } from '@utils/url/desktop-loop-url.util';
import { ArrowRight, Layers3, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useMemo, useState } from 'react';

const COUNT_OPTIONS = Array.from({ length: 10 }, (_, index) => index + 1);

/** Client errors whose server detail is user-actionable and safe to surface. */
const USER_ACTIONABLE_ERROR_STATUSES = new Set([400, 402, 404, 409, 422]);
const MAX_SERVER_ERROR_DETAIL_LENGTH = 200;

/**
 * Resolve the message shown after a failed generation. Transport and server
 * exception text (e.g. "Request failed with status code 500") must never
 * reach the user; only a validated, user-actionable JSON:API detail may
 * replace the localized fallback.
 */
function resolveGenerationErrorMessage(
  error: unknown,
  fallback: string,
): string {
  const status = getErrorStatus(error);
  if (status === undefined || !USER_ACTIONABLE_ERROR_STATUSES.has(status)) {
    return fallback;
  }

  const document = ErrorHandler.isJsonApiError(error)
    ? error
    : (() => {
        const data = (error as IAxiosLikeError)?.response?.data;
        return ErrorHandler.isJsonApiError(data) ? data : null;
      })();
  const detail = document?.errors[0]?.detail;
  return typeof detail === 'string' &&
    detail.trim().length > 0 &&
    detail.length < MAX_SERVER_ERROR_DETAIL_LENGTH &&
    !detail.includes('\n')
    ? detail
    : fallback;
}

function resolvePlatform(value: string | null) {
  return isSourcePostVariationPlatform(value) ? value : null;
}

function TrendRemixPageContent() {
  const translate = useTranslations('common');
  const searchParams = useSearchParams();
  const { href } = useOrgUrl();
  const getPostsService = useAuthedService((token: string) =>
    PostsService.getInstance(token),
  );
  const notifications = useMemo(() => NotificationsService.getInstance(), []);
  const [count, setCount] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<IPostVariationResult | null>(null);

  const platform = resolvePlatform(searchParams.get('platform'));
  const sourceInput = useMemo((): GenerateSourcePostVariationsInput | null => {
    if (!platform) return null;
    const postId = searchParams.get('postId')?.trim();
    const sourcePostId = searchParams.get('sourcePostId')?.trim();
    const sourceReferenceId = searchParams.get('sourceReferenceId')?.trim();
    const trendId = searchParams.get('trendId')?.trim();
    const selectors = [postId, sourcePostId, sourceReferenceId].filter(Boolean);
    if (selectors.length !== 1 || (sourceReferenceId && !trendId)) return null;

    return {
      platform,
      ...(postId && { postId }),
      ...(sourcePostId && { sourcePostId }),
      ...(sourceReferenceId && { sourceReferenceId, trendId }),
    };
  }, [platform, searchParams]);

  const generate = async () => {
    if (!sourceInput) {
      setError(translate('sourcePostVariations.errors.invalidSource'));
      return;
    }

    try {
      setError(null);
      setIsSubmitting(true);
      const service = await getPostsService();
      const nextResult = await service.generateSourceVariations({
        ...sourceInput,
        count,
      });
      setResult(nextResult);
      if (nextResult.meta.partialReason) {
        notifications.warning(nextResult.meta.partialReason);
      } else {
        notifications.success(
          translate('sourcePostVariations.notifications.ready', {
            count: nextResult.meta.actualCount,
          }),
        );
      }
    } catch (generationError) {
      logger.error(
        'Failed to generate source post variations',
        generationError,
      );
      const message = resolveGenerationErrorMessage(
        generationError,
        translate('sourcePostVariations.errors.generationFailed'),
      );
      setError(message);
      notifications.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const reviewHref = result?.meta.reviewBatchId
    ? href(
        `${APP_ROUTES.PUBLISHING.REVIEW}?batch=${encodeURIComponent(result.meta.reviewBatchId)}`,
      )
    : null;
  const visibleError =
    error ||
    (!sourceInput
      ? translate('sourcePostVariations.errors.invalidSourceDetailed')
      : null);
  const variationUnit = (value: number) =>
    translate(
      value === 1
        ? 'sourcePostVariations.count.unitOne'
        : 'sourcePostVariations.count.unitMany',
    );

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <header className="max-w-2xl space-y-2">
        <div className="flex items-center gap-2 text-sm text-foreground/55">
          <Layers3 className="size-4" />
          {translate('sourcePostVariations.eyebrow')}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {translate('sourcePostVariations.title')}
        </h1>
        <p className="text-sm leading-6 text-foreground/62">
          {translate('sourcePostVariations.description')}
        </p>
      </header>

      <section aria-labelledby="setup-title">
        <Card bodyClassName="p-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold" id="setup-title">
                  {translate('sourcePostVariations.count.title')}
                </h2>
                <p className="mt-1 text-xs text-foreground/55">
                  {translate('sourcePostVariations.count.help')}
                </p>
              </div>
              <Select
                value={String(count)}
                onValueChange={(value) => setCount(Number(value))}
              >
                <SelectTrigger
                  className="w-48"
                  aria-label={translate('sourcePostVariations.count.ariaLabel')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNT_OPTIONS.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {translate('sourcePostVariations.count.option', {
                        count: option,
                        unit: variationUnit(option),
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col items-start gap-3 sm:items-end">
              <Badge variant="secondary">
                {translate('sourcePostVariations.pricing', {
                  cost: sourcePostVariationCredits(count),
                  perVariation: sourcePostVariationCredits(1),
                })}
              </Badge>
              <Button
                icon={<Sparkles className="size-4" />}
                isDisabled={!sourceInput}
                isLoading={isSubmitting}
                label={translate('sourcePostVariations.generate', {
                  count,
                  unit: variationUnit(count),
                })}
                onClick={() => {
                  generate().catch(() => undefined);
                }}
                variant={ButtonVariant.DEFAULT}
              />
            </div>
          </div>
        </Card>
      </section>

      {visibleError ? (
        <p
          className="border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          {visibleError}
        </p>
      ) : null}

      {result ? (
        <section className="space-y-4" aria-labelledby="variations-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold" id="variations-title">
                  {translate('sourcePostVariations.results.ready', {
                    actual: result.meta.actualCount,
                    requested: result.meta.requestedCount,
                  })}
                </h2>
                <Badge variant="outline">
                  {translate(
                    result.meta.voiceMode === 'brand-voice'
                      ? 'sourcePostVariations.results.brandVoice'
                      : 'sourcePostVariations.results.organizationDefaults',
                  )}
                </Badge>
              </div>
              {result.meta.creditCost != null || result.meta.groupId ? (
                <p className="mt-1 text-sm text-foreground/55">
                  {result.meta.groupId
                    ? translate('sourcePostVariations.results.summary', {
                        credits: result.meta.creditCost,
                        group: result.meta.groupId.slice(0, 8),
                      })
                    : translate('sourcePostVariations.results.creditsCharged', {
                        credits: result.meta.creditCost,
                      })}
                </p>
              ) : null}
            </div>
            {reviewHref ? (
              <Button
                asChild
                size={ButtonSize.SM}
                variant={ButtonVariant.DEFAULT}
                withWrapper={false}
              >
                <Link href={reviewHref}>
                  {translate('sourcePostVariations.results.reviewAll')}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            ) : null}
          </div>

          {result.meta.partialReason ? (
            <p
              className="border border-warning/35 bg-warning/10 p-3 text-sm text-warning"
              role="status"
            >
              {result.meta.partialReason}{' '}
              {translate('sourcePostVariations.results.noPadding')}
            </p>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {result.posts.map((post, index) => (
              <article key={post.id}>
                <Card bodyClassName="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant="secondary">
                      {translate('sourcePostVariations.results.label', {
                        count: result.meta.actualCount,
                        position: index + 1,
                      })}
                    </Badge>
                    <span className="text-xs capitalize text-foreground/45">
                      {post.platform}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground/80">
                    {post.description}
                  </p>
                  {result.meta.reviewBatchId ? (
                    <p className="mt-2 text-xs text-foreground/45">
                      {translate('sourcePostVariations.results.provenance', {
                        batch: result.meta.reviewBatchId.slice(0, 8),
                      })}
                    </p>
                  ) : null}
                </Card>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

export default function TrendRemixPage() {
  return (
    <Suspense fallback={null}>
      <TrendRemixPageContent />
    </Suspense>
  );
}
