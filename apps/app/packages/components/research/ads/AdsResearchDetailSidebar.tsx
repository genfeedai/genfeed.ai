'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type {
  AdPack,
  AdsChannel,
  AdsResearchDetail,
  AdsResearchItem,
  AdsResearchPlatform,
  CampaignLaunchPrep,
} from '@genfeedai/interfaces';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import MetricCard from '@ui/cards/metric-card/MetricCard';
import Badge from '@ui/display/badge/Badge';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import {
  Bookmark,
  ChartColumn,
  ExternalLink,
  Rocket,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { formatMetric } from './ads-metric.helpers';

type SelectedAdRef = {
  adAccountId?: string;
  channel?: AdsChannel;
  credentialId?: string;
  id: string;
  loginCustomerId?: string;
  platform?: AdsResearchPlatform;
  source: 'public' | 'my_accounts';
  savedAdId?: string;
};

type SummaryMetricCardProps = {
  label: string;
  value: string;
};

function SummaryMetricCard({ label, value }: SummaryMetricCardProps) {
  return <MetricCard label={label} size="sm" value={value} />;
}

type AdPackPanelProps = {
  adPack: AdPack;
};

function AdPackPanel({ adPack }: AdPackPanelProps) {
  return (
    <div className="space-y-4 rounded-md bg-emerald-500/5 p-4">
      <div className="flex items-center gap-2">
        <Badge variant="success">Ad Pack Ready</Badge>
        <span className="text-sm text-muted-foreground">
          Review before launch
        </span>
      </div>

      <div>
        <div className="mb-2 text-2xs uppercase tracking-[0.18em] text-foreground/45">
          Headlines
        </div>
        <div className="space-y-2">
          {adPack.headlines.map((headline) => (
            <div
              key={headline}
              className="rounded-md bg-background-tertiary px-3 py-2 text-sm text-foreground"
            >
              {headline}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-2xs uppercase tracking-[0.18em] text-foreground/45">
          Primary Text
        </div>
        <p className="whitespace-pre-wrap text-sm text-foreground/85">
          {adPack.primaryText}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-2 text-2xs uppercase tracking-[0.18em] text-foreground/45">
            CTA
          </div>
          <p className="text-sm text-foreground/85">{adPack.cta}</p>
        </div>
        <div>
          <div className="mb-2 text-2xs uppercase tracking-[0.18em] text-foreground/45">
            Channel
          </div>
          <p className="text-sm text-foreground/85">
            {adPack.campaignRecipe.platform === 'meta'
              ? 'Meta Ads'
              : adPack.campaignRecipe.platform === 'tiktok'
                ? 'TikTok Ads'
                : adPack.campaignRecipe.platform === 'x'
                  ? 'X Ads'
                  : 'Google Ads'}{' '}
            / {adPack.campaignRecipe.channel}
          </p>
        </div>
      </div>

      <div>
        <div className="mb-2 text-2xs uppercase tracking-[0.18em] text-foreground/45">
          Creative Brief
        </div>
        <p className="text-sm text-foreground/85">
          {adPack.assetCreativeBrief}
        </p>
      </div>

      <div>
        <div className="mb-2 text-2xs uppercase tracking-[0.18em] text-foreground/45">
          Targeting Notes
        </div>
        <p className="text-sm text-foreground/85">{adPack.targetingNotes}</p>
      </div>

      <div>
        <div className="mb-2 text-2xs uppercase tracking-[0.18em] text-foreground/45">
          Campaign Recipe
        </div>
        <p className="text-sm text-foreground/85">
          {adPack.campaignRecipe.budgetStrategy}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {adPack.campaignRecipe.placements.map((placement) => (
            <Badge key={placement} variant="ghost">
              {placement}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}

type LaunchPrepPanelProps = {
  prep: CampaignLaunchPrep;
};

function LaunchPrepPanel({ prep }: LaunchPrepPanelProps) {
  const { href } = useOrgUrl();

  return (
    <div className="space-y-4 rounded-md bg-amber-500/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="warning">Launch Plan Ready</Badge>
          <span className="text-sm text-muted-foreground">
            No external ad objects were created
          </span>
        </div>
        <Badge variant="ghost">{prep.publishMode}</Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <SummaryMetricCard label="Campaign plan" value={prep.campaign.name} />
        <SummaryMetricCard label="Ad set plan" value={prep.adSet.name} />
        <SummaryMetricCard label="Ad plan" value={prep.ad.name} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-2 text-2xs uppercase tracking-[0.18em] text-foreground/45">
            Objective
          </div>
          <p className="text-sm text-foreground/85">
            {prep.campaign.objective}
          </p>
        </div>
        <div>
          <div className="mb-2 text-2xs uppercase tracking-[0.18em] text-foreground/45">
            Optimization Goal
          </div>
          <p className="text-sm text-foreground/85">
            {prep.adSet.optimizationGoal}
          </p>
        </div>
      </div>

      <div>
        <div className="mb-2 text-2xs uppercase tracking-[0.18em] text-foreground/45">
          Plan Notes
        </div>
        <ul className="space-y-2 text-sm text-foreground/85">
          {prep.notes.map((note) => (
            <li
              key={note}
              className="rounded-md bg-background-tertiary px-3 py-2"
            >
              {note}
            </li>
          ))}
        </ul>
      </div>

      {prep.workflowId && (
        <Link
          href={href(`${APP_ROUTES.AUTOMATE.WORKFLOWS}/${prep.workflowId}`)}
          className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
        >
          Open linked workflow
          <ExternalLink className="size-4" />
        </Link>
      )}
    </div>
  );
}

type DetailSidebarProps = {
  detail: AdsResearchDetail | null;
  detailLoading: boolean;
  href: (path: string) => string;
  selectedAd: SelectedAdRef;
  onClose: () => void;
  onOpenRemix: () => void;
  onRunAction: (action: 'ad_pack' | 'workflow' | 'launch_prep') => void;
  busyAction: 'ad_pack' | 'workflow' | 'launch_prep' | null;
  actionError: string | null;
  adPackResult: AdPack | null;
  launchPrepResult: CampaignLaunchPrep | null;
  workflowResult: {
    description?: string;
    workflowId: string;
    workflowName: string;
  } | null;
  brandLabel: string;
  onToggleSaved: (items: AdsResearchItem[]) => void;
  onUpdateSavedNote: (id: string, note: string) => void;
  savedMutating: boolean;
};

export function DetailSidebar({
  detail,
  detailLoading,
  href,
  onClose,
  onOpenRemix,
  onRunAction,
  busyAction,
  actionError,
  adPackResult,
  launchPrepResult,
  workflowResult,
  onToggleSaved,
  onUpdateSavedNote,
  savedMutating,
}: DetailSidebarProps) {
  const translate = useTranslations('pages.adsResearch.swipeFile');
  const [note, setNote] = useState('');

  useEffect(() => {
    setNote(detail?.savedNote ?? '');
  }, [detail?.savedNote]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={
          'fixed inset-0 z-40 bg-black/50 transition-opacity' // design-system-allow-content-color
        }
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-[480px] overflow-y-auto border-l border-border bg-background shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-5 py-4">
          <div className="flex items-center gap-2">
            <ChartColumn className="size-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Ad Detail</h2>
          </div>
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.SM}
            icon={<X className="size-4" />}
            onClick={onClose}
            ariaLabel="Close detail"
          />
        </div>

        <div className="space-y-5 p-5">
          {detailLoading ? (
            <p className="text-sm text-muted-foreground">Loading ad detail…</p>
          ) : !detail ? (
            <p className="text-sm text-muted-foreground">
              {translate('unavailable')}
            </p>
          ) : (
            <>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="ghost">
                    {detail.platform === 'meta'
                      ? 'Meta Ads'
                      : detail.platform === 'tiktok'
                        ? 'TikTok Ads'
                        : detail.platform === 'x'
                          ? 'X Ads'
                          : 'Google Ads'}
                  </Badge>
                  {detail.channel !== 'all' && (
                    <Badge variant="ghost">{detail.channel}</Badge>
                  )}
                  {detail.status && <Badge status={detail.status} />}
                  {detail.isSavedSnapshot && (
                    <Badge variant="success">
                      {translate('snapshotBadge')}
                    </Badge>
                  )}
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground">
                    {detail.title}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {detail.accountName || detail.campaignName || 'Ad detail'}
                  </p>
                </div>

                <p className="text-sm leading-6 text-foreground/85">
                  {detail.explanation}
                </p>

                {detail.creative.headline && (
                  <div>
                    <div className="mb-1 text-2xs uppercase tracking-[0.18em] text-foreground/45">
                      Headline
                    </div>
                    <p className="text-sm text-foreground/85">
                      {detail.creative.headline}
                    </p>
                  </div>
                )}

                {detail.creative.body && (
                  <div>
                    <div className="mb-1 text-2xs uppercase tracking-[0.18em] text-foreground/45">
                      Primary Text
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-foreground/85">
                      {detail.creative.body}
                    </p>
                  </div>
                )}

                <div className="grid gap-3 md:grid-cols-2">
                  <SummaryMetricCard
                    label="CTR"
                    value={formatMetric(detail.metrics.ctr)}
                  />
                  <SummaryMetricCard
                    label="ROAS"
                    value={formatMetric(detail.metrics.roas)}
                  />
                </div>

                <div>
                  <div className="mb-2 text-2xs uppercase tracking-[0.18em] text-foreground/45">
                    Detected Patterns
                  </div>
                  {detail.patternSummary && detail.patternSummary.length > 0 ? (
                    <div className="space-y-2">
                      {detail.patternSummary.map((pattern) => (
                        <div
                          key={`${pattern.id}-${pattern.label}`}
                          className="rounded-md bg-background-tertiary p-3"
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {pattern.label}
                            </span>
                            {typeof pattern.score === 'number' && (
                              <Badge variant="ghost">
                                {formatMetric(pattern.score)}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs leading-5 text-muted-foreground">
                            {pattern.summary}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No reusable pattern summary was attached to this ad yet.
                    </p>
                  )}
                </div>

                {detail.landingPageUrl && (
                  <a
                    href={detail.landingPageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
                  >
                    Open landing page
                    <ExternalLink className="size-4" />
                  </a>
                )}
              </div>

              {actionError && (
                <Alert type={AlertCategory.ERROR}>
                  <div className="text-xs">{actionError}</div>
                </Alert>
              )}

              <div className="grid gap-2">
                <Button
                  variant={
                    detail.savedAdId
                      ? ButtonVariant.SECONDARY
                      : ButtonVariant.GHOST
                  }
                  size={ButtonSize.SM}
                  disabled={
                    savedMutating || detail.usagePolicy === 'disclosure_only'
                  }
                  onClick={() => onToggleSaved([detail])}
                  icon={
                    <Bookmark
                      className={
                        detail.savedAdId ? 'size-4 fill-current' : 'size-4'
                      }
                    />
                  }
                >
                  {detail.savedAdId
                    ? translate('unsaveAction')
                    : translate('saveAction')}
                </Button>
                {detail.savedAdId ? (
                  <div className="space-y-2 rounded-md border border-border p-3">
                    <label
                      className="text-xs font-medium text-foreground"
                      htmlFor="saved-ad-note"
                    >
                      {translate('noteLabel')}
                    </label>
                    <Textarea
                      id="saved-ad-note"
                      value={note}
                      maxLength={1000}
                      placeholder={translate('notePlaceholder')}
                      onChange={(event) => setNote(event.target.value)}
                    />
                    <Button
                      variant={ButtonVariant.GHOST}
                      size={ButtonSize.SM}
                      disabled={savedMutating}
                      onClick={() =>
                        onUpdateSavedNote(detail.savedAdId as string, note)
                      }
                    >
                      {translate('saveNote')}
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-2">
                <Button
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.SM}
                  onClick={onOpenRemix}
                  icon={<Sparkles className="size-4" />}
                >
                  Remix for my brand
                </Button>
                {!detail.isSavedSnapshot ? (
                  <Button
                    variant={ButtonVariant.DEFAULT}
                    size={ButtonSize.SM}
                    isLoading={busyAction === 'workflow'}
                    onClick={() => onRunAction('workflow')}
                    icon={<Wrench className="size-4" />}
                  >
                    Create workflow
                  </Button>
                ) : null}
                {!detail.isSavedSnapshot ? (
                  <Button
                    variant={ButtonVariant.SECONDARY}
                    size={ButtonSize.SM}
                    isLoading={busyAction === 'launch_prep'}
                    onClick={() => onRunAction('launch_prep')}
                    icon={<Rocket className="size-4" />}
                  >
                    Build launch plan
                  </Button>
                ) : null}
              </div>

              {workflowResult && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant="primary">Workflow Created</Badge>
                    <span className="text-sm font-medium text-foreground">
                      {workflowResult.workflowName}
                    </span>
                  </div>
                  {workflowResult.description && (
                    <p className="mb-3 text-sm text-foreground/75">
                      {workflowResult.description}
                    </p>
                  )}
                  <Link
                    href={href(
                      `${APP_ROUTES.AUTOMATE.WORKFLOWS}/${workflowResult.workflowId}`,
                    )}
                    className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
                  >
                    Open workflow editor
                    <ExternalLink className="size-4" />
                  </Link>
                </div>
              )}

              {adPackResult && <AdPackPanel adPack={adPackResult} />}
              {launchPrepResult && <LaunchPrepPanel prep={launchPrepResult} />}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
