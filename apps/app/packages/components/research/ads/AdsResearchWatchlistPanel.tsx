'use client';

import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  AdWatchedAdvertiser,
  AdWatchlistPlatform,
  AdWatchlistPlatformReadiness,
} from '@genfeedai/contracts/interfaces';
import Card from '@ui/card/Card';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const WATCHLIST_PLATFORM_OPTIONS: Array<{
  label: string;
  value: AdWatchlistPlatform;
}> = [
  { label: 'Meta Ad Library', value: 'meta' },
  { label: 'TikTok Creative Center', value: 'tiktok' },
  { label: 'Google Ads Transparency', value: 'google' },
  { label: 'YouTube (Google Ads Transparency)', value: 'youtube' },
  { label: 'X Ads Repository', value: 'x' },
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
  x_ads_repository_commercial_use_not_approved:
    'X grants the Ads Repository for transparency only. Its creative is disclosure-only and cannot be remixed.',
  x_ads_repository_contract_fixtures_missing:
    'X Ads Repository ingestion stays off until its contract is verified against reviewed fixtures.',
  x_ads_repository_entitlement_not_confirmed:
    'This deployment has no confirmed X Ads Repository entitlement.',
};

const FRESHNESS_LABELS: Record<string, string> = {
  empty: 'No live ads',
  fresh: 'Fresh',
  stale: 'Stale',
  unavailable: 'Not polled',
};

function describeBlocker(blocker: string): string {
  return BLOCKER_LABELS[blocker] || blocker;
}

function AdvertiserRow({
  advertiser,
  isBusy,
  onRemove,
}: {
  advertiser: AdWatchedAdvertiser;
  isBusy: boolean;
  onRemove: (id: string) => void;
}) {
  const translate = useTranslations('pages.adsResearch.watchlist');
  const lastRun = advertiser.lastSuccessfulAt || advertiser.lastAttemptedAt;

  return (
    <li className="flex items-center justify-between gap-3 rounded-md bg-background-tertiary px-3 py-2">
      <div className="min-w-0 space-y-0.5">
        <div className="truncate text-sm font-medium text-foreground">
          {advertiser.advertiserName || advertiser.advertiserHandle}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-2xs text-foreground/50">
          <span className="uppercase tracking-[0.14em]">
            {advertiser.platform}
          </span>
          <span>
            {FRESHNESS_LABELS[advertiser.freshnessState] ||
              advertiser.freshnessState}
          </span>
          {typeof advertiser.lastSnapshotRecordCount === 'number' ? (
            <span>
              {translate('creatives', {
                count: advertiser.lastSnapshotRecordCount,
              })}
            </span>
          ) : null}
          {lastRun ? (
            <span>{new Date(lastRun).toLocaleDateString()}</span>
          ) : null}
          {advertiser.lastIngestionErrorCode ? (
            <span className="text-destructive">
              {describeBlocker(advertiser.lastIngestionErrorCode)}
            </span>
          ) : null}
        </div>
      </div>
      <Button
        ariaLabel={`Stop watching ${advertiser.advertiserHandle}`}
        disabled={isBusy}
        icon={<Trash2 className="size-4" />}
        size={ButtonSize.ICON}
        variant={ButtonVariant.GHOST}
        onClick={() => onRemove(advertiser.id)}
      />
    </li>
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
  onAdd: (input: {
    advertiserHandle: string;
    platform: AdWatchlistPlatform;
  }) => void;
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
  onAdd,
  onRemove,
}: AdsResearchWatchlistPanelProps) {
  const translate = useTranslations('pages.adsResearch.watchlist');
  const [advertiserHandle, setAdvertiserHandle] = useState('');
  const [platform, setPlatform] = useState<AdWatchlistPlatform>('meta');
  const blockedPlatforms = readiness.filter((entry) => !entry.available);

  return (
    <Card className="mb-4 bg-card/40" bodyClassName="gap-3 p-4">
      <div className="space-y-1">
        <div className="text-sm font-semibold text-foreground">
          {translate('title')}
        </div>
        <p className="text-xs text-foreground/55">{translate('description')}</p>
      </div>

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
        <Alert type={AlertCategory.ERROR}>
          <div className="text-xs">{addError || loadError}</div>
        </Alert>
      ) : null}

      {blockedPlatforms.length > 0 ? (
        <Alert type={AlertCategory.INFO}>
          <div className="space-y-1 text-xs">
            <div className="font-medium">
              {translate('archivesUnavailable')}
            </div>
            <ul className="space-y-0.5 text-foreground/70">
              {blockedPlatforms.map((entry) => (
                <li key={entry.platform}>
                  <span className="uppercase tracking-[0.14em]">
                    {entry.platform}
                  </span>
                  {' — '}
                  {entry.blockers.map(describeBlocker).join(' ')}
                </li>
              ))}
            </ul>
          </div>
        </Alert>
      ) : null}

      {isLoading ? (
        <p className="text-xs text-foreground/45">{translate('loading')}</p>
      ) : advertisers.length === 0 ? (
        <p className="text-xs text-foreground/45">{translate('empty')}</p>
      ) : (
        <ul className="space-y-2">
          {advertisers.map((advertiser) => (
            <AdvertiserRow
              key={advertiser.id}
              advertiser={advertiser}
              isBusy={busyId === advertiser.id}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}
