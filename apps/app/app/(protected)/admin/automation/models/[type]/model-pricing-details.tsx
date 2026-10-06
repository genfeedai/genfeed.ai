'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { formatCreditCost } from '@genfeedai/contracts/constants';
import type {
  AdminModelPricingRow,
  ModelPricingEvidence,
} from '@genfeedai/contracts/interfaces';
import { exportModelPricingCsv } from '@genfeedai/pricing';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type {
  ModelPricingDetailsProps,
  ModelPricingToolbarProps,
} from '@props/admin/models.props';
import type { TableColumn } from '@props/ui/display/table.props';
import { AdminModelPricingService } from '@services/admin/model-pricing.service';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Download, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  ADMIN_MODEL_PRICING_QUERY_KEY,
  useAdminModelPricingReport,
} from './use-admin-model-pricing-report';

type PricingTranslate = ReturnType<
  typeof useTranslations<'pages.adminModelPricing'>
>;

function credits(
  value: number | null,
  isFree: boolean,
  t: PricingTranslate,
): string {
  if (value === null || (value === 0 && !isFree)) return t('unresolved');
  return value === 0
    ? t('explicitlyFree')
    : t('credits', { value: formatCreditCost(value) });
}

function usd(value: number | null, t: PricingTranslate): string {
  return value === null
    ? t('unresolved')
    : `$${value.toLocaleString('en-US', { maximumFractionDigits: 8 })} USD`;
}

function dimensions(row: AdminModelPricingRow, t: PricingTranslate): string {
  const values = row.dimensions;
  const durations = Array.isArray(values.durations) ? values.durations : [];
  const selectors =
    values.selectors !== null && typeof values.selectors === 'object'
      ? values.selectors
      : {};
  return [
    durations.length ? t('seconds', { value: durations.join(', ') }) : null,
    Object.keys(selectors).length
      ? JSON.stringify(selectors)
      : t('bandsNotCaptured'),
    typeof values.maxOutputs === 'number' && values.maxOutputs > 0
      ? t('maxOutputs', { count: values.maxOutputs })
      : t('outputLimitUnresolved'),
    typeof values.maxReferences === 'number' && values.maxReferences > 0
      ? t('maxReferences', { count: values.maxReferences })
      : null,
    values.hasAudioToggle ? t('audioReview') : null,
    values.maxDimensions
      ? t('maxDimensions', { value: JSON.stringify(values.maxDimensions) })
      : null,
    values.minDimensions
      ? t('minDimensions', { value: JSON.stringify(values.minDimensions) })
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function PricingEvidence({
  label,
  evidence,
}: {
  label: string;
  evidence: ModelPricingEvidence | null;
}) {
  const t = useTranslations('pages.adminModelPricing');
  if (!evidence)
    return (
      <p>
        {label}: {t('unresolved')}
      </p>
    );
  return (
    <div className="mb-2">
      <p>
        {label}: {evidence.currency ?? t('unresolved')}{' '}
        {evidence.unitPrice ?? t('unresolved')} /{' '}
        {evidence.billingUnit ?? t('unresolvedUnit')}
      </p>
      <p>
        {t('review')} {evidence.reviewStatus} {t('mapping')}{' '}
        {evidence.mappingStatus}
      </p>
      <p>
        {t('provenance')} {evidence.source ?? t('unresolved')}
      </p>
      <p>
        {t('source')} {evidence.sourceUrl ?? t('unresolved')}
      </p>
      <p>
        {t('rateVerified')} {evidence.verifiedAt ?? t('unresolved')}
      </p>
      <p>
        {t('contractObserved')} {evidence.observedAt}
      </p>
      {evidence.rates ? (
        <p>
          {t('reviewedBands')} {JSON.stringify(evidence.rates)}
        </p>
      ) : null}
      {Object.keys(evidence.conditionalDimensions).length ? (
        <p>{JSON.stringify(evidence.conditionalDimensions)}</p>
      ) : null}
    </div>
  );
}

function AttentionBadge({ row }: { row: AdminModelPricingRow }) {
  const t = useTranslations('pages.adminModelPricing');
  if (row.attentionLevel === 'red')
    return <Badge variant="destructive">{t('badgeRed')}</Badge>;
  if (row.attentionLevel === 'orange')
    return <Badge variant="warning">{t('badgeOrange')}</Badge>;
  return null;
}

function isRatesChanged(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const response: unknown = Reflect.get(error, 'response');
  return (
    typeof response === 'object' &&
    response !== null &&
    Reflect.get(response, 'status') === 409
  );
}

function priceOrNone(value: number | null, t: PricingTranslate): string {
  return value === null
    ? t('noPrice')
    : `$${value.toLocaleString('en-US', { maximumFractionDigits: 10 })}`;
}

/**
 * Orange price-change rows: show old → new per variant and let a superadmin
 * promote the pending rates. The approved rate keeps charging until then.
 */
function ApproveRatesControl({ row }: { row: AdminModelPricingRow }) {
  const t = useTranslations('pages.adminModelPricing');
  const queryClient = useQueryClient();
  const [isConfirming, setIsConfirming] = useState(false);
  const getService = useAuthedService((token: string) =>
    AdminModelPricingService.getInstance(token),
  );
  const mutation = useMutation({
    mutationFn: async () => {
      const expectedPendingVersion = row.pending?.version;
      if (!expectedPendingVersion) throw new Error('No pending rates');
      return (await getService()).approveRates(row.id, expectedPendingVersion);
    },
    onSuccess: (report) => {
      setIsConfirming(false);
      queryClient.setQueryData(ADMIN_MODEL_PRICING_QUERY_KEY, report);
    },
    onError: (error) => {
      // 409: the refresh found newer rates than the operator reviewed.
      setIsConfirming(false);
      if (isRatesChanged(error))
        void queryClient.invalidateQueries({
          queryKey: ADMIN_MODEL_PRICING_QUERY_KEY,
        });
    },
  });
  if (row.pendingRateChanges.length === 0 && !row.isRateApprovalAvailable)
    return null;
  return (
    <div className="mt-2 space-y-1">
      <p className="font-medium">{t('pendingPriceChanges')}</p>
      {row.pendingRateChanges.length === 0 ? <p>{t('termsChanged')}</p> : null}
      <ul className="list-disc pl-4">
        {row.pendingRateChanges.map((change) => (
          <li key={`${change.component}:${change.variant}`}>
            {t('priceChangeLine', {
              newPrice: priceOrNone(change.newPriceUsd, t),
              oldPrice: priceOrNone(change.oldPriceUsd, t),
              variant: change.variant,
            })}
            {change.hasTermsChange ? ` (${t('termsChanged')})` : ''}
          </li>
        ))}
      </ul>
      {row.isRateApprovalAvailable ? (
        <div className="flex flex-wrap gap-2">
          {isConfirming ? (
            <>
              <Button
                disabled={mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {t('confirmApproveRates')}
              </Button>
              <Button
                variant={ButtonVariant.GHOST}
                disabled={mutation.isPending}
                onClick={() => setIsConfirming(false)}
              >
                {t('cancelApproveRates')}
              </Button>
            </>
          ) : (
            <Button
              variant={ButtonVariant.SECONDARY}
              onClick={() => {
                mutation.reset();
                setIsConfirming(true);
              }}
            >
              {t('approveRates')}
            </Button>
          )}
        </div>
      ) : null}
      {mutation.error ? (
        <p role="alert">
          {isRatesChanged(mutation.error)
            ? t('approveRatesChanged')
            : t('approveRatesFailed')}
        </p>
      ) : null}
    </div>
  );
}

function pricingColumns(
  t: PricingTranslate,
): TableColumn<AdminModelPricingRow>[] {
  return [
    {
      header: t('model'),
      key: 'key',
      render: (row) => (
        <div>
          <span className="font-medium">{row.key}</span>{' '}
          <AttentionBadge row={row} />
          <p className="text-xs text-muted-foreground">
            {row.provider} · {row.category} ·{' '}
            {row.isActive ? t('enabled') : t('disabled')} · {row.lifecycle}
          </p>
        </div>
      ),
    },
    {
      header: t('providerCost'),
      key: 'configuredProviderCostUsd',
      render: (row) => (
        <div className="text-xs tabular-nums">
          <p>{usd(row.configuredProviderCostUsd, t)}</p>
          <p>{row.pricingType ?? t('flatFallback')}</p>
          {row.category === 'text' ? (
            <p>
              {t('inputOutput')} {usd(row.inputCostPerMillionTokens, t)} /{' '}
              {usd(row.outputCostPerMillionTokens, t)} {t('perMillionTokens')}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      header: t('customerQuote'),
      key: 'effectiveUnitCredits',
      render: (row) => (
        <div className="text-xs tabular-nums">
          <p>
            {credits(row.effectiveUnitCredits, row.isFree, t)} {t('perUnit')}
          </p>
          <p>
            {credits(row.effectiveSampleCredits, row.isFree, t)} /{' '}
            {row.sampleDuration
              ? t('durationSample', { seconds: row.sampleDuration })
              : t('singleOutputSample')}
          </p>
          <p className="text-muted-foreground">
            {t('stored')} {credits(row.configuredCost, row.isFree, t)}
            {t('storedPerUnit')}{' '}
            {credits(row.configuredCostPerUnit, row.isFree, t)}
            {t('minimum')} {credits(row.configuredMinCost, row.isFree, t)}
          </p>
        </div>
      ),
    },
    {
      header: t('billedDimensions'),
      key: 'dimensions',
      render: (row) => <p className="max-w-sm text-xs">{dimensions(row, t)}</p>,
    },
    {
      header: t('providerEvidence'),
      key: 'reviewed',
      render: (row) => (
        <div className="text-xs">
          <PricingEvidence label={t('reviewed')} evidence={row.reviewed} />
          {row.pending ? (
            <PricingEvidence label={t('pending')} evidence={row.pending} />
          ) : null}
        </div>
      ),
    },
    {
      header: t('reconciliation'),
      key: 'status',
      render: (row) => (
        <div className="text-xs">
          <p className="font-medium capitalize">{row.status}</p>
          <p className="max-w-sm text-muted-foreground">
            {row.reasons.join(' · ')}
          </p>
          <ApproveRatesControl row={row} />
        </div>
      ),
    },
  ];
}

export default function ModelPricingDetails({
  modelId,
}: ModelPricingDetailsProps) {
  const t = useTranslations('pages.adminModelPricing');
  const {
    data: report,
    isLoading,
    error,
    refetch,
  } = useAdminModelPricingReport();
  const row = report?.rows.find((entry) => entry.id === modelId);
  if (isLoading)
    return <p className="p-4 text-sm text-muted-foreground">{t('loading')}</p>;
  if (error)
    return (
      <div className="p-4" role="alert">
        <p>{t('unavailable')}</p>
        <Button
          variant={ButtonVariant.SECONDARY}
          onClick={() => void refetch()}
        >
          {t('refresh')}
        </Button>
      </div>
    );
  if (!row)
    return <p className="p-4 text-sm text-muted-foreground">{t('empty')}</p>;
  return (
    <section className="space-y-3 p-4" aria-label={`Pricing for ${row.key}`}>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {row.key} <AttentionBadge row={row} />
      </h3>
      <p className="text-xs text-muted-foreground">
        {report?.isConversionPolicyConfigured
          ? t('policyLoaded', {
              margin: report.marginMultiplierGeneration ?? t('unresolved'),
            })
          : t('policyUnresolved')}{' '}
        · {t('retrieved')} {report?.retrievedAt}
      </p>
      <dl className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {pricingColumns(t)
          .filter((column) => column.key !== 'key')
          .map((column) => (
            <div
              className="min-w-0 space-y-1 break-words"
              key={String(column.key)}
            >
              <dt className="text-xs font-semibold">{column.header}</dt>
              <dd>{column.render?.(row)}</dd>
            </div>
          ))}
      </dl>
    </section>
  );
}

export function ModelPricingToolbar({ models }: ModelPricingToolbarProps) {
  const t = useTranslations('pages.adminModelPricing');
  const {
    data: report,
    isFetching,
    error,
    refetch,
  } = useAdminModelPricingReport();
  const rows = useMemo(
    () =>
      report?.rows.filter((row) =>
        models.some((model) => model.id === row.id),
      ) ?? [],
    [report, models],
  );
  return (
    <div className="flex gap-2">
      <Button
        variant={ButtonVariant.GHOST}
        aria-label={t('refresh')}
        onClick={() => void refetch()}
        disabled={isFetching}
      >
        <RefreshCw />
      </Button>
      <Button
        variant={ButtonVariant.SECONDARY}
        disabled={!report || !!error || isFetching}
        onClick={() => {
          if (!report) return;
          const blob = new Blob([exportModelPricingCsv({ ...report, rows })], {
            type: 'text/csv;charset=utf-8',
          });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `model-pricing-${report.retrievedAt.replaceAll(':', '-')}.csv`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);
        }}
      >
        <Download />
        {t('export')}
      </Button>
    </div>
  );
}
