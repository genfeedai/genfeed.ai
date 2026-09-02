'use client';

import {
  ButtonSize,
  ButtonVariant,
  SourcePostActionType,
} from '@genfeedai/contracts';
import type {
  IListeningEvidence,
  IListeningSignal,
  IListeningTheme,
  ISocialIntelligenceTopicBundle,
  ReviewListeningThemeState,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useSocialIntelligence } from '@hooks/data/analytics/use-social-intelligence/use-social-intelligence';
import { ContentRunsService } from '@services/content/content-runs.service';
import { SourcePostsService } from '@services/social/source-posts.service';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { RadioGroup, RadioGroupItem } from '@ui/primitives/radio-group';
import { ExternalLink, Inbox, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

interface SocialIntelligenceInboxProps {
  brandId?: string;
  organizationId: string;
}

interface ThemeCoverage {
  included: string[];
  missing: string[];
  partial: boolean;
  reason: string | null;
}

function formatWindow(start: string, end: string): string {
  const formatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return `${formatter.format(new Date(start))} – ${formatter.format(new Date(end))}`;
}

function reviewLabel(theme: IListeningTheme): string {
  if (theme.reviewState === 'acknowledged') {
    return 'Acknowledged';
  }
  if (theme.reviewState === 'deferred') {
    return 'Deferred';
  }
  return 'Needs review';
}

function themeEvidence(
  theme: IListeningTheme,
  evidence: IListeningEvidence[],
): IListeningEvidence[] {
  const evidenceIds = new Set(theme.evidenceIds);
  return evidence.filter((item) => evidenceIds.has(item.id));
}

function themeSignals(
  theme: IListeningTheme,
  signals: IListeningSignal[],
): IListeningSignal[] {
  return signals.filter((signal) => signal.analysisKey === theme.analysisKey);
}

function coverageForTheme(
  theme: IListeningTheme,
  bundle: ISocialIntelligenceTopicBundle,
): ThemeCoverage {
  const signals = themeSignals(theme, bundle.signals);
  const includedIds = new Set(
    signals.flatMap((signal) => signal.includedSourceIds ?? []),
  );
  const missingIds = new Set(
    signals.flatMap((signal) => signal.excludedSourceIds ?? []),
  );
  const sourceLabel = (sourceId: string) =>
    String(
      bundle.topic.sources.find((source) => source.sourceId === sourceId)
        ?.platform ?? sourceId,
    );
  const insufficiency = signals.find(
    (signal) => signal.insufficiencyReason,
  )?.insufficiencyReason;
  const missing = [...missingIds].map(sourceLabel);
  const failedSources = bundle.topic.sources.filter(
    (source) =>
      source.collectionState === 'failed' ||
      source.collectionState === 'rate_limited',
  );
  for (const source of failedSources) {
    if (!missing.includes(String(source.platform))) {
      missing.push(String(source.platform));
    }
  }
  const partial = missing.length > 0 || Boolean(insufficiency);
  const reason = partial
    ? [
        missing.length > 0 ? `Missing ${missing.join(', ')} coverage` : null,
        insufficiency ? insufficiency.replaceAll('_', ' ') : null,
        ...failedSources.map((source) => source.lastCollectionError),
      ]
        .filter((value): value is string => Boolean(value))
        .join(' — ')
    : null;
  return {
    included: [...includedIds].map(sourceLabel),
    missing,
    partial,
    reason,
  };
}

function StateCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="border-border bg-secondary/40">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
        {onRetry ? (
          <Button
            icon={<RefreshCw className="size-3.5" />}
            label="Retry"
            onClick={onRetry}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          />
        ) : null}
      </div>
    </Card>
  );
}

export default function SocialIntelligenceInbox({
  brandId,
  organizationId,
}: SocialIntelligenceInboxProps) {
  const translate = useTranslations('pages.socialIntelligence');
  const inbox = useSocialIntelligence({
    brandId: brandId ?? '',
    enabled: Boolean(brandId),
    organizationId,
  });
  const getContentRunsService = useAuthedService((token: string) =>
    ContentRunsService.getInstance(token),
  );
  const getSourcePostsService = useAuthedService((token: string) =>
    SourcePostsService.getInstance(token),
  );
  const [confirmedThemes, setConfirmedThemes] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedEvidence, setSelectedEvidence] = useState<
    Record<string, string>
  >({});
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionMessages, setActionMessages] = useState<Record<string, string>>(
    {},
  );

  const setMessage = useCallback((themeId: string, message: string) => {
    setActionMessages((current) => ({ ...current, [themeId]: message }));
  }, []);

  const handleReview = useCallback(
    async (
      topicId: string,
      themeId: string,
      state: ReviewListeningThemeState,
    ) => {
      const actionKey = `${themeId}:${state}`;
      setBusyAction(actionKey);
      setMessage(themeId, '');
      try {
        await inbox.reviewTheme(topicId, themeId, state);
        setMessage(
          themeId,
          state === 'acknowledged' ? 'Theme acknowledged' : 'Theme deferred',
        );
      } catch (error) {
        setMessage(
          themeId,
          error instanceof Error ? error.message : 'Theme review failed',
        );
      } finally {
        setBusyAction(null);
      }
    },
    [inbox, setMessage],
  );

  const handleCreateBrief = useCallback(
    async (bundle: ISocialIntelligenceTopicBundle, theme: IListeningTheme) => {
      if (!brandId) {
        return;
      }
      const evidence = themeEvidence(theme, bundle.evidence);
      const actionKey = `${theme.id}:brief`;
      setBusyAction(actionKey);
      setMessage(theme.id, '');
      try {
        const service = await getContentRunsService();
        const evidenceLines = evidence
          .map((item) =>
            [item.contentExcerpt, item.sourceUrl].filter(Boolean).join(' — '),
          )
          .filter(Boolean);
        const signal = themeSignals(theme, bundle.signals)[0];
        await service.createResearchBriefRun(brandId, {
          confidence: signal?.confidence,
          evidence: evidenceLines,
          metrics: {
            listeningAnalysisKey: theme.analysisKey,
            listeningEvidenceIds: theme.evidenceIds,
            listeningThemeId: theme.id,
            listeningTopicId: bundle.topic.id,
          },
          platform: String(evidence[0]?.platform ?? 'multi-platform'),
          sourceContentId: theme.id,
          sourceReferenceId: theme.analysisKey,
          sourceUrl: evidence[0]?.sourceUrl ?? undefined,
          text: evidenceLines.join('\n'),
          title: theme.label,
          trendId: theme.id,
          trendTopic: theme.label,
        });
        setMessage(theme.id, 'Brief created as a content run');
      } catch (error) {
        setMessage(
          theme.id,
          error instanceof Error ? error.message : 'Brief creation failed',
        );
      } finally {
        setBusyAction(null);
      }
    },
    [brandId, getContentRunsService, setMessage],
  );

  const handleCreateResponse = useCallback(
    async (bundle: ISocialIntelligenceTopicBundle, theme: IListeningTheme) => {
      if (!brandId) {
        return;
      }
      const evidence = themeEvidence(theme, bundle.evidence).find(
        (item) => item.id === selectedEvidence[theme.id],
      );
      if (!evidence?.sourcePostId) {
        setMessage(theme.id, 'Response unavailable for this evidence');
        return;
      }
      const actionKey = `${theme.id}:response`;
      setBusyAction(actionKey);
      setMessage(theme.id, '');
      try {
        const service = await getSourcePostsService();
        await service.createDraft(
          evidence.sourcePostId,
          {
            actionType: SourcePostActionType.REPLY,
            listeningEvidenceIds: [evidence.id],
            listeningThemeId: theme.id,
            listeningTopicId: bundle.topic.id,
          },
          { brandId },
        );
        setMessage(theme.id, 'Response saved as a draft');
      } catch (error) {
        setMessage(
          theme.id,
          error instanceof Error ? error.message : 'Draft creation failed',
        );
      } finally {
        setBusyAction(null);
      }
    },
    [brandId, getSourcePostsService, selectedEvidence, setMessage],
  );

  const body = useMemo(() => {
    if (!brandId) {
      return (
        <StateCard message="Select a brand to review social intelligence" />
      );
    }
    if (inbox.state === 'loading') {
      return <StateCard message="Loading social intelligence…" />;
    }
    if (inbox.state === 'empty') {
      return <StateCard message="No listening themes yet" />;
    }
    if (inbox.state === 'forbidden') {
      return (
        <StateCard
          message="You do not have access to this social intelligence inbox"
          onRetry={() => void inbox.retry()}
        />
      );
    }
    if (inbox.state === 'rate_limited') {
      return (
        <StateCard
          message="Social sources are rate limited"
          onRetry={() => void inbox.retry()}
        />
      );
    }
    if (inbox.state === 'failed') {
      return (
        <StateCard
          message="Social intelligence could not be loaded"
          onRetry={() => void inbox.retry()}
        />
      );
    }

    return (
      <div className="space-y-5">
        {inbox.partialReason ? (
          <div
            className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm text-warning"
            role="status"
          >
            {inbox.partialReason}
          </div>
        ) : null}
        {inbox.items.map((bundle) => (
          <section className="space-y-3" key={bundle.topic.id}>
            <div>
              <h3 className="text-base font-semibold">{bundle.topic.label}</h3>
              <p className="text-xs text-muted-foreground">
                {translate('monitoredSources', {
                  count: bundle.topic.sources.length,
                })}
              </p>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {bundle.themes.map((theme) => {
                const evidence = themeEvidence(theme, bundle.evidence);
                const coverage = coverageForTheme(theme, bundle);
                const confirmed = confirmedThemes.has(theme.id);
                const selected = evidence.find(
                  (item) => item.id === selectedEvidence[theme.id],
                );
                const hasResponseEvidence = evidence.some((item) =>
                  Boolean(item.sourcePostId),
                );
                const contentActionDisabled = coverage.partial && !confirmed;
                return (
                  <Card
                    bodyClassName="gap-4"
                    key={theme.id}
                    label={theme.label}
                    description={`${evidence.length} evidence item${evidence.length === 1 ? '' : 's'}`}
                    headerAction={
                      <Badge
                        variant={
                          theme.reviewState === 'acknowledged'
                            ? 'success'
                            : theme.reviewState === 'deferred'
                              ? 'secondary'
                              : 'warning'
                        }
                      >
                        {reviewLabel(theme)}
                      </Badge>
                    }
                  >
                    <dl className="grid gap-2 text-xs text-muted-foreground">
                      <div>
                        <dt className="font-medium text-foreground">
                          {translate('currentWindow')}
                        </dt>
                        <dd>
                          {formatWindow(
                            theme.currentWindowStart,
                            theme.currentWindowEnd,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium text-foreground">
                          {translate('previousWindow')}
                        </dt>
                        <dd>
                          {formatWindow(
                            theme.previousWindowStart,
                            theme.previousWindowEnd,
                          )}
                        </dd>
                      </div>
                    </dl>

                    <div className="space-y-2">
                      <p className="text-xs font-medium text-foreground">
                        {translate('sourceCoverage')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {translate('includedSources', {
                          sources: coverage.included.join(', ') || 'None',
                        })}
                      </p>
                      {coverage.missing.length > 0 ? (
                        <p className="text-xs text-warning">
                          {translate('excludedSources', {
                            sources: coverage.missing.join(', '),
                          })}
                        </p>
                      ) : null}
                      {coverage.reason ? (
                        <p className="text-xs text-warning">
                          {coverage.reason}
                        </p>
                      ) : null}
                    </div>

                    <RadioGroup
                      aria-label={`Evidence for ${theme.label}`}
                      onValueChange={(value) =>
                        setSelectedEvidence((current) => ({
                          ...current,
                          [theme.id]: value,
                        }))
                      }
                      value={selectedEvidence[theme.id]}
                    >
                      {evidence.map((item) => {
                        const excerpt =
                          item.contentExcerpt || `Evidence ${item.id}`;
                        const isFresh =
                          new Date(item.freshnessExpiresAt).getTime() >
                          Date.now();
                        return (
                          <div
                            className="flex items-start gap-3 rounded-md border border-border p-3"
                            key={item.id}
                          >
                            <RadioGroupItem
                              aria-label={excerpt}
                              className="mt-0.5"
                              value={item.id}
                            />
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <p className="text-sm leading-relaxed">
                                {excerpt}
                              </p>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                  variant={isFresh ? 'success' : 'warning'}
                                >
                                  {isFresh ? 'Fresh' : 'Stale'}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {String(item.platform)}
                                </span>
                                {item.sourceUrl ? (
                                  <Link
                                    className="inline-flex items-center gap-1 text-xs text-info hover:underline"
                                    href={item.sourceUrl}
                                    rel="noreferrer"
                                    target="_blank"
                                  >
                                    {translate('openSource')}
                                    <ExternalLink className="size-3" />
                                  </Link>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </RadioGroup>

                    {!hasResponseEvidence ||
                    (selected && !selected.sourcePostId) ? (
                      <p className="text-xs text-warning">
                        {translate('responseUnavailable')}
                      </p>
                    ) : null}

                    {coverage.partial ? (
                      <Checkbox
                        isChecked={confirmed}
                        label="I understand this theme has partial source coverage"
                        onCheckedChange={(checked) =>
                          setConfirmedThemes((current) => {
                            const next = new Set(current);
                            if (checked === true) {
                              next.add(theme.id);
                            } else {
                              next.delete(theme.id);
                            }
                            return next;
                          })
                        }
                      />
                    ) : null}

                    <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                      <Button
                        isDisabled={inbox.isReviewing}
                        isLoading={busyAction === `${theme.id}:acknowledged`}
                        label="Acknowledge"
                        onClick={() =>
                          void handleReview(
                            bundle.topic.id,
                            theme.id,
                            'acknowledged',
                          )
                        }
                        size={ButtonSize.SM}
                        variant={ButtonVariant.SECONDARY}
                      />
                      <Button
                        isDisabled={inbox.isReviewing}
                        isLoading={busyAction === `${theme.id}:deferred`}
                        label="Defer"
                        onClick={() =>
                          void handleReview(
                            bundle.topic.id,
                            theme.id,
                            'deferred',
                          )
                        }
                        size={ButtonSize.SM}
                        variant={ButtonVariant.GHOST}
                      />
                      <Button
                        isDisabled={contentActionDisabled}
                        isLoading={busyAction === `${theme.id}:brief`}
                        label="Create brief"
                        onClick={() => void handleCreateBrief(bundle, theme)}
                        size={ButtonSize.SM}
                      />
                      <Button
                        isDisabled={
                          contentActionDisabled || !selected?.sourcePostId
                        }
                        isLoading={busyAction === `${theme.id}:response`}
                        label="Create response"
                        onClick={() => void handleCreateResponse(bundle, theme)}
                        size={ButtonSize.SM}
                        variant={ButtonVariant.SECONDARY}
                      />
                    </div>
                    {actionMessages[theme.id] ? (
                      <p
                        className="text-xs text-muted-foreground"
                        role="status"
                      >
                        {actionMessages[theme.id]}
                      </p>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    );
  }, [
    actionMessages,
    brandId,
    busyAction,
    confirmedThemes,
    handleCreateBrief,
    handleCreateResponse,
    handleReview,
    inbox,
    selectedEvidence,
    translate,
  ]);

  return (
    <section
      aria-labelledby="social-intelligence-heading"
      className="space-y-4"
    >
      <div className="flex items-center gap-3">
        <div className="rounded-md bg-info/10 p-2 text-info">
          <Inbox className="size-4" />
        </div>
        <div>
          <h2
            className="text-lg font-semibold"
            id="social-intelligence-heading"
          >
            {translate('title')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {translate('description')}
          </p>
        </div>
      </div>
      {body}
    </section>
  );
}
