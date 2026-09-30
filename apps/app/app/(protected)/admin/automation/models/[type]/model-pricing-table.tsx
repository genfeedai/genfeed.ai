'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { formatCreditCost } from '@genfeedai/contracts/constants';
import type {
  AdminModelPricingRow,
  ModelPricingEvidence,
} from '@genfeedai/contracts/interfaces';
import { exportModelPricingCsv } from '@genfeedai/pricing';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TableColumn } from '@props/ui/display/table.props';
import { AdminModelPricingService } from '@services/admin/model-pricing.service';
import { useQuery } from '@tanstack/react-query';
import AppTable from '@ui/display/table/Table';
import { Button } from '@ui/primitives/button';
import FormSearchbar from '@ui/primitives/searchbar';
import { Download, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

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

function pricingColumns(
  t: PricingTranslate,
): TableColumn<AdminModelPricingRow>[] {
  return [
    {
      header: t('model'),
      key: 'key',
      render: (row) => (
        <div>
          <span className="font-medium">{row.key}</span>
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
        </div>
      ),
    },
  ];
}

export default function ModelPricingTable() {
  const t = useTranslations('pages.adminModelPricing');
  const columns = pricingColumns(t);
  const [search, setSearch] = useState('');
  const getService = useAuthedService((token: string) =>
    AdminModelPricingService.getInstance(token),
  );
  const {
    data: report,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['admin-model-pricing'],
    queryFn: async ({ signal }) => (await getService()).getReport(signal),
  });
  const rows = useMemo(
    () =>
      report?.rows.filter((row) =>
        row.key.toLowerCase().includes(search.toLowerCase()),
      ) ?? [],
    [report, search],
  );
  return (
    <section aria-label={t('operatorLabel')}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t('title')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('description')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <FormSearchbar
            placeholder={t('search')}
            value={search}
            onSearch={setSearch}
          />
          <Button
            variant={ButtonVariant.SECONDARY}
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw />
            {t('refresh')}
          </Button>
          <Button
            variant={ButtonVariant.SECONDARY}
            disabled={!report || !!error || isFetching}
            onClick={() => {
              if (!report) return;
              const blob = new Blob(
                [exportModelPricingCsv({ ...report, rows })],
                {
                  type: 'text/csv;charset=utf-8',
                },
              );
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
      </div>
      {report ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {t('source')} {report.source} {t('retrieved')} {report.retrievedAt} ·{' '}
          {rows.length} {t('rows')} ·{' '}
          {rows.filter((row) => row.status === 'unresolved').length}{' '}
          {t('unresolved')} ·{' '}
          {report.isConversionPolicyConfigured
            ? t('policyLoaded', {
                margin: report.marginMultiplierGeneration ?? t('unresolved'),
              })
            : t('policyUnresolved')}
        </p>
      ) : null}
      <AppTable
        columns={columns}
        items={rows}
        getRowKey={(row) => row.id}
        isLoading={isLoading}
        ariaLabel={t('title')}
        error={
          error
            ? {
                title: t('unavailable'),
                onRetry: () => void refetch(),
              }
            : undefined
        }
        emptyLabel={t('empty')}
      />
    </section>
  );
}
