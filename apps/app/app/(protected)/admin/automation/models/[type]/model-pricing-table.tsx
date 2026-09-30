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
import { useMemo, useState } from 'react';

function credits(value: number | null, isFree: boolean): string {
  if (value === null || (value === 0 && !isFree)) return 'Unresolved';
  return value === 0 ? 'Explicitly free' : `${formatCreditCost(value)} credits`;
}

function usd(value: number | null): string {
  return value === null
    ? 'Unresolved'
    : `$${value.toLocaleString('en-US', { maximumFractionDigits: 8 })} USD`;
}

function dimensions(row: AdminModelPricingRow): string {
  const values = row.dimensions;
  const durations = Array.isArray(values.durations) ? values.durations : [];
  const selectors =
    values.selectors !== null && typeof values.selectors === 'object'
      ? values.selectors
      : {};
  return [
    durations.length ? `${durations.join(', ')} seconds` : null,
    Object.keys(selectors).length
      ? JSON.stringify(selectors)
      : 'Resolution / quality bands not captured',
    values.maxOutputs
      ? `Up to ${values.maxOutputs} outputs`
      : 'Output limit unresolved',
    values.maxReferences ? `Up to ${values.maxReferences} references` : null,
    values.hasAudioToggle
      ? 'Audio selectable; rate applicability requires review'
      : null,
    values.maxDimensions
      ? `Maximum dimensions: ${JSON.stringify(values.maxDimensions)}`
      : null,
    values.minDimensions
      ? `Minimum dimensions: ${JSON.stringify(values.minDimensions)}`
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
  if (!evidence) return <p>{label}: unresolved</p>;
  return (
    <div className="mb-2">
      <p>
        {label}: {evidence.currency ?? 'Unresolved'}{' '}
        {evidence.unitPrice ?? 'Unresolved'} /{' '}
        {evidence.billingUnit ?? 'unresolved unit'}
      </p>
      <p>
        Review: {evidence.reviewStatus} · Mapping: {evidence.mappingStatus}
      </p>
      <p>Provenance: {evidence.source ?? 'unresolved'}</p>
      <p>Source: {evidence.sourceUrl ?? 'unresolved'}</p>
      <p>Rate verified: {evidence.verifiedAt ?? 'unresolved'}</p>
      <p>Contract observed: {evidence.observedAt}</p>
      {evidence.rates ? (
        <p>Reviewed rate bands: {JSON.stringify(evidence.rates)}</p>
      ) : null}
      {Object.keys(evidence.conditionalDimensions).length ? (
        <p>{JSON.stringify(evidence.conditionalDimensions)}</p>
      ) : null}
    </div>
  );
}

const columns: TableColumn<AdminModelPricingRow>[] = [
  {
    header: 'Model',
    key: 'key',
    render: (row) => (
      <div>
        <span className="font-medium">{row.key}</span>
        <p className="text-xs text-muted-foreground">
          {row.provider} · {row.category} ·{' '}
          {row.isActive ? 'Enabled' : 'Disabled'} · {row.lifecycle}
        </p>
      </div>
    ),
  },
  {
    header: 'Configured provider cost',
    key: 'configuredProviderCostUsd',
    render: (row) => (
      <div className="text-xs tabular-nums">
        <p>{usd(row.configuredProviderCostUsd)}</p>
        <p>{row.pricingType ?? 'flat (runtime fallback)'}</p>
        {row.category === 'text' ? (
          <p>
            Input / output: {usd(row.inputCostPerMillionTokens)} /{' '}
            {usd(row.outputCostPerMillionTokens)} per 1M tokens
          </p>
        ) : null}
      </div>
    ),
  },
  {
    header: 'Configured customer quote',
    key: 'effectiveUnitCredits',
    render: (row) => (
      <div className="text-xs tabular-nums">
        <p>{credits(row.effectiveUnitCredits, row.isFree)} / unit</p>
        <p>
          {credits(row.effectiveSampleCredits, row.isFree)} /{' '}
          {row.sampleDuration
            ? `${row.sampleDuration}s sample`
            : 'single-output sample'}
        </p>
        <p className="text-muted-foreground">
          Stored: {credits(row.configuredCost, row.isFree)}; per unit:{' '}
          {credits(row.configuredCostPerUnit, row.isFree)}; minimum:{' '}
          {credits(row.configuredMinCost, row.isFree)}
        </p>
      </div>
    ),
  },
  {
    header: 'Billed dimensions',
    key: 'dimensions',
    render: (row) => <p className="max-w-sm text-xs">{dimensions(row)}</p>,
  },
  {
    header: 'Provider evidence',
    key: 'reviewed',
    render: (row) => (
      <div className="text-xs">
        <PricingEvidence label="Reviewed" evidence={row.reviewed} />
        {row.pending ? (
          <PricingEvidence label="Pending" evidence={row.pending} />
        ) : null}
      </div>
    ),
  },
  {
    header: 'Reconciliation',
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

export default function ModelPricingTable() {
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
    <section aria-label="Operator model pricing">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">
            Model pricing reconciliation
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Configured quotes are single-output samples. Provider variants and
            account discounts require approved evidence.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <FormSearchbar
            placeholder="Search pricing by model"
            value={search}
            onSearch={setSearch}
          />
          <Button
            variant={ButtonVariant.SECONDARY}
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw />
            Refresh snapshot
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
            Export displayed pricing
          </Button>
        </div>
      </div>
      {report ? (
        <p className="mb-3 text-xs text-muted-foreground">
          Source: {report.source} · Retrieved {report.retrievedAt} ·{' '}
          {rows.length} rows ·{' '}
          {rows.filter((row) => row.status === 'unresolved').length} unresolved
          ·{' '}
          {report.isConversionPolicyConfigured
            ? 'Configured conversion policy loaded'
            : 'Conversion policy unresolved'}
        </p>
      ) : null}
      <AppTable
        columns={columns}
        items={rows}
        getRowKey={(row) => row.id}
        isLoading={isLoading}
        ariaLabel="Model pricing reconciliation"
        error={
          error
            ? {
                title: 'Pricing snapshot unavailable',
                onRetry: () => void refetch(),
              }
            : undefined
        }
        emptyLabel="No pricing rows"
      />
    </section>
  );
}
