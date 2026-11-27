'use client';

import {
  ButtonSize,
  ButtonVariant,
  CardPadding,
  CardVariant,
  ComponentSize,
} from '@genfeedai/contracts';
import {
  AdsPlatform,
  type AdWatchedAdvertiser,
  type AdWatchlistPlatform,
  type AdWatchlistPlatformReadiness,
} from '@genfeedai/contracts/interfaces';
import Card from '@ui/card/Card';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { Alert } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import DateText from '@ui/time/DateText';
import { RefreshCw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import AdsCompetitorSuggestions from './AdsCompetitorSuggestions';

const WATCHLIST_PLATFORM_OPTIONS: Array<{
  label: string;
  value: AdWatchlistPlatform;
}> = [
  { label: 'Meta Ad Library', value: AdsPlatform.META },
  { label: 'TikTok Ads Library', value: AdsPlatform.TIKTOK },
  { label: 'Google Ads Transparency', value: AdsPlatform.GOOGLE },
  { label: 'YouTube (Google Ads Transparency)', value: 'youtube' },
  { label: 'X Ads Repository', value: AdsPlatform.X },
];

/**
 * Human wording for the readiness blockers the API returns as machine codes.
 * Anything unmapped falls back to the raw code rather than a vague sentence —
 * an operator filing a bug needs the exact string the backend emitted.
 */
const BLOCKER_LABELS: Record<string, string> = {
  google_ads_transparency_contract_fixtures_missing:
    'Google publishes no ad API. Ingestion stays off until its contract is verified against reviewed fixtures.',
  paid_creative_apify_token_missing:
    'The archive scraper credential is not configured on this deployment.',
  paid_creative_snapshot_write_failed:
    'The archive responded but the result could not be saved. Try again.',
  paid_creative_source_unavailable:
    'The archive could not be reached on the last poll. Try again shortly.',
  research_collection_start_unreconciled:
    "We couldn't confirm whether this collection started. It's safe to retry.",
  research_paid_access_required:
    'Daily rescans of watched competitors are part of a plan. Poll now still works while you have scans left.',
  research_scan_limit_reached:
    'No scans were left on the last poll. Poll again when your next scan opens.',
  research_subscription_unverified:
    'Subscription status could not be verified, so collection stayed off. Saved ads stay available.',
  x_ads_repository_commercial_use_not_approved:
    'X grants the Ads Repository for transparency only. Its creative is disclosure-only and cannot be remixed.',
  x_ads_repository_contract_fixtures_missing:
    'X Ads Repository ingestion stays off until its contract is verified against reviewed fixtures.',
  x_ads_repository_entitlement_not_confirmed:
    'This deployment has no confirmed X Ads Repository entitlement.',
};

const FRESHNESS_LABELS: Record<string, string> = {
  empty: 'No creatives found',
  fresh: 'Fresh',
  stale: 'Stale',
  unavailable: 'Unavailable',
};

function describeBlocker(blocker: string): string {
  return BLOCKER_LABELS[blocker] || blocker;
}

/**
 * `unavailable` is the column default, so a row that was never polled and a
 * row whose last poll was blocked would otherwise read the same.
 */
function describeFreshness(advertiser: AdWatchedAdvertiser): string {
  if (
    advertiser.freshnessState === 'unavailable' &&
    !advertiser.lastAttemptedAt
  ) {
    return 'Not polled yet';
  }
  if (advertiser.freshnessState === 'unavailable') {
    return 'Last poll blocked';
  }
  return (
    FRESHNESS_LABELS[advertiser.freshnessState] || advertiser.freshnessState
  );
}

function AdvertiserRow({
  advertiser,
  canScan,
  isBusy,
  onPoll,
  onRemove,
}: {
  advertiser: AdWatchedAdvertiser;
  /** False while the ads library has no scans left; a poll is a scan. */
  canScan: boolean;
  isBusy: boolean;
  onPoll: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const translate = useTranslations('pages.adsResearch.watchlist');
  const lastRun = advertiser.lastSuccessfulAt || advertiser.lastAttemptedAt;

  return (
    <Card
      variant={CardVariant.INSET}
      padding={CardPadding.SM}
      as="li"
      bodyClassName="flex-row items-center justify-between"
    >
      <div className="min-w-0 space-y-0.5">
        <div className="truncate text-sm font-medium text-foreground">
          {advertiser.advertiserName || advertiser.advertiserHandle}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-2xs text-foreground/50">
          <PlatformBadge
            platform={advertiser.platform}
            size={ComponentSize.SM}
          />
          <span>{describeFreshness(advertiser)}</span>
          {typeof advertiser.lastSnapshotRecordCount === 'number' ? (
            <span>
              {translate('creatives', {
                count: advertiser.lastSnapshotRecordCount,
              })}
            </span>
          ) : null}
          {lastRun ? <DateText hasTime={false} value={lastRun} /> : null}
          {advertiser.lastIngestionErrorCode ? (
            <span className="text-destructive">
              {describeBlocker(advertiser.lastIngestionErrorCode)}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          ariaLabel={`Poll ${advertiser.advertiserHandle} now`}
          disabled={isBusy || !canScan}
          icon={<RefreshCw className="size-4" />}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          onClick={() => onPoll(advertiser.id)}
        >
          {isBusy ? 'Polling…' : 'Poll now'}
        </Button>
        <Button
          ariaLabel={`Stop watching ${advertiser.advertiserHandle}`}
          disabled={isBusy}
          icon={<Trash2 className="size-4" />}
          size={ButtonSize.ICON}
          variant={ButtonVariant.GHOST}
          onClick={() => onRemove(advertiser.id)}
        />
      </div>
    </Card>
  );
}

export type AdsResearchWatchlistPanelProps = {
  addError?: string;
  advertisers: AdWatchedAdvertiser[];
  busyId?: string;
  isAdding: boolean;
  isLoading: boolean;
  loadError?: string;
  readiness: AdWatchlistPlatformReadiness[];
  /** Competitors the brand already names that are not watched yet. */
  suggestions?: string[];
  /** Scans left in the ads library; null when it has no limit. */
  scansLeft?: number | null;
  onAdd: (input: {
    advertiserHandle: string;
    platform: AdWatchlistPlatform;
  }) => void;
  onPoll: (id: string) => void;
  onRemove: (id: string) => void;
};

/**
 * Operator surface for the competitor watchlist behind Discovery → Ads.
 *
 * Blocked archives are shown, not hidden: a watch row on an unreachable
 * archive produces no creative, and the difference between "we could not look"
 * and "this competitor is not advertising" has to be legible on the same
 * screen as the empty result it explains.
 */
export function AdsResearchWatchlistPanel({
  addError,
  advertisers,
  busyId,
  isAdding,
  isLoading,
  loadError,
  readiness,
  suggestions = [],
  scansLeft = null,
  onAdd,
  onPoll,
  onRemove,
}: AdsResearchWatchlistPanelProps) {
  const translate = useTranslations('pages.adsResearch.watchlist');
  const [advertiserHandle, setAdvertiserHandle] = useState('');
  const [platform, setPlatform] = useState<AdWatchlistPlatform>(
    AdsPlatform.META,
  );
  const blockedPlatforms = readiness.filter((entry) => !entry.available);

  return (
    <div className="space-y-4">
      <AdsCompetitorSuggestions
        isAdding={isAdding}
        platform={platform}
        scansLeft={scansLeft}
        suggestions={suggestions}
        onAdd={onAdd}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={advertiserHandle}
          onChange={(event) => setAdvertiserHandle(event.target.value)}
          placeholder="Advertiser handle or page name"
          aria-label="Advertiser handle"
          className="h-8 w-[220px] text-xs"
        />
        <Select
          value={platform}
          onValueChange={(value) => setPlatform(value as AdWatchlistPlatform)}
        >
          <SelectTrigger
            aria-label="Watchlist platform"
            className="h-8 w-auto min-w-[200px] bg-transparent text-xs"
          >
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent>
            {WATCHLIST_PLATFORM_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.SM}
          disabled={isAdding}
          onClick={() => {
            onAdd({ advertiserHandle, platform });
            setAdvertiserHandle('');
          }}
        >
          {translate('watchCompetitor')}
        </Button>
      </div>

      {addError || loadError ? (
        <Alert variant="destructive">
          <div className="text-xs">{addError || loadError}</div>
        </Alert>
      ) : null}

      {blockedPlatforms.length > 0 ? (
        <Alert variant="info">
          <div className="space-y-1 text-xs">
            <div className="font-medium">
              {translate('archivesUnavailable')}
            </div>
            <ul className="space-y-0.5 text-foreground/70">
              {blockedPlatforms.map((entry) => (
                <li key={entry.platform}>
                  <PlatformBadge
                    platform={entry.platform}
                    size={ComponentSize.SM}
                  />
                  {' — '}
                  {entry.blockers.map(describeBlocker).join(' ')}
                </li>
              ))}
            </ul>
          </div>
        </Alert>
      ) : null}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">{translate('loading')}</p>
      ) : advertisers.length === 0 ? (
        <p className="text-xs text-muted-foreground">{translate('empty')}</p>
      ) : (
        <ul className="space-y-2">
          {advertisers.map((advertiser) => (
            <AdvertiserRow
              key={advertiser.id}
              advertiser={advertiser}
              canScan={scansLeft !== 0}
              isBusy={busyId === advertiser.id}
              onPoll={onPoll}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
