'use client';
import { ButtonVariant } from '@genfeedai/contracts';
import type {
  LearningPromptSlotOutcomeGroup,
  LearningPromptSlotOutcomeReport,
  LearningSlotComparison,
  LearningSlotGroup,
  LearningSlotVerdict,
} from '@genfeedai/contracts/interfaces';
import type { TableColumn } from '@props/ui/display/table.props';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import Table from '@ui/display/table/Table';
import { Alert, AlertDescription } from '@ui/primitives/alert';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { EmptyState } from '@ui/primitives/empty-state';
import { useTranslations } from 'next-intl';
import { WorkspaceSurface } from '@/components/overview/WorkspaceSurface';
import type { LearningReportPanelProps } from '@/features/admin/props/learning.props';

const VERDICT_VARIANTS: Record<
  LearningSlotVerdict,
  'success' | 'destructive' | 'secondary'
> = {
  better: 'success',
  insufficient_data: 'secondary',
  within_noise: 'secondary',
  worse: 'destructive',
};

/** Decided verdicts first, so the signal is not buried under empty slots. */
const VERDICT_ORDER: Record<LearningSlotVerdict, number> = {
  better: 0,
  worse: 1,
  within_noise: 2,
  insufficient_data: 3,
};

const NUMERIC_CELL = 'text-right tabular-nums';

function formatScore(value: number | null, fallback: string): string {
  return value === null ? fallback : value.toFixed(3);
}

function sortComparisons(
  comparisons: LearningSlotComparison[],
): LearningSlotComparison[] {
  return [...comparisons].sort(
    (a, b) =>
      VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] ||
      Math.abs(b.difference ?? 0) - Math.abs(a.difference ?? 0),
  );
}

function ComparisonTable({ group }: { group: LearningPromptSlotOutcomeGroup }) {
  const translate = useTranslations('pages.adminLearning');

  const stats = (value: LearningSlotGroup) =>
    translate('groupStats', {
      count: value.count,
      mean: formatScore(value.mean, translate('noData')),
    });

  const columns: TableColumn<LearningSlotComparison>[] = [
    {
      header: translate('columns.slot'),
      key: 'slot',
      render: (row) => <span className="font-medium">{row.slot}</span>,
    },
    {
      header: translate('columns.value'),
      key: 'value',
      render: (row) => row.value ?? translate('filledVsEmpty'),
    },
    {
      className: NUMERIC_CELL,
      header: translate('columns.filled'),
      key: 'filled',
      render: (row) => stats(row.filled),
    },
    {
      className: NUMERIC_CELL,
      header: translate('columns.rest'),
      key: 'rest',
      render: (row) => stats(row.rest),
    },
    {
      className: NUMERIC_CELL,
      header: translate('columns.difference'),
      key: 'difference',
      render: (row) =>
        row.difference === null
          ? translate('noData')
          : translate('range', {
              difference: formatScore(row.difference, translate('noData')),
              lower: formatScore(row.lower, translate('noData')),
              upper: formatScore(row.upper, translate('noData')),
            }),
    },
    {
      header: translate('columns.verdict'),
      key: 'verdict',
      render: (row) => (
        <Badge variant={VERDICT_VARIANTS[row.verdict]}>
          {translate(`verdicts.${row.verdict}`)}
        </Badge>
      ),
    },
  ];

  return (
    <Table<LearningSlotComparison>
      ariaLabel={translate('group', {
        category: group.category,
        count: group.postCount,
        objective: group.objective,
      })}
      columns={columns}
      getRowKey={(row) => `${row.slot}:${row.value ?? ''}`}
      items={sortComparisons(group.comparison.comparisons)}
    />
  );
}

function ReportView({ report }: { report: LearningPromptSlotOutcomeReport }) {
  const translate = useTranslations('pages.adminLearning');

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>{translate('summary', { count: report.postCount })}</p>
        <p>{translate('skipped', report.skipped)}</p>
        {report.isTruncated && <p>{translate('truncated')}</p>}
      </div>
      {report.groups.length === 0 ? (
        <EmptyState title={translate('empty')} />
      ) : (
        report.groups.map((group) => (
          <WorkspaceSurface
            key={`${group.category}:${group.objective}`}
            title={translate('group', {
              category: group.category,
              count: group.postCount,
              objective: group.objective,
            })}
            tone="muted"
          >
            <ComparisonTable group={group} />
          </WorkspaceSurface>
        ))
      )}
      <p className="border-t border-border pt-4 text-xs text-muted-foreground">
        {translate('note')}
      </p>
    </div>
  );
}

/**
 * The prompt slot report for one organization: which slots go with better or
 * worse measured outcomes, grouped by media type and objective. Shared by the
 * Learning page and the organization's Learning tab.
 */
export default function LearningReportPanel({
  hasOrganization,
  isError,
  isLoading,
  onRetry,
  report,
}: LearningReportPanelProps) {
  const translate = useTranslations('pages.adminLearning');

  if (!hasOrganization) {
    return <EmptyState title={translate('selectOrganization')} />;
  }
  if (isLoading) {
    return (
      <div role="status" aria-label={translate('loading')}>
        <SkeletonCard showImage={false} />
      </div>
    );
  }
  if (isError) {
    return (
      <Alert variant="destructive" icon={false}>
        <AlertDescription>{translate('loadFailed')}</AlertDescription>
        <Button
          label={translate('retry')}
          variant={ButtonVariant.SECONDARY}
          onClick={onRetry}
        />
      </Alert>
    );
  }
  return report ? <ReportView report={report} /> : null;
}
