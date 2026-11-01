'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type {
  LearningPromptSlotOutcomeGroup,
  LearningPromptSlotOutcomeReport,
  LearningSlotComparison,
  LearningSlotGroup,
  LearningSlotVerdict,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TableColumn } from '@props/ui/display/table.props';
import { AdminLearningPromptSlotsService } from '@services/admin/learning-prompt-slots.service';
import { logger } from '@services/core/logger.service';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import Table from '@ui/display/table/Table';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { EmptyState } from '@ui/primitives/empty-state';
import Field from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { Cog } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useCallback, useRef, useState } from 'react';
import { WorkspaceSurface } from '@/components/overview/WorkspaceSurface';

type ReportState = 'idle' | 'loading' | 'ready' | 'error';

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

function parseOrganizationIds(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

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
      {report.isPooled && (
        <Alert>
          <AlertTitle>{translate('pooled.title')}</AlertTitle>
          <AlertDescription>{translate('pooled.description')}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>
          {translate('summary', {
            count: report.postCount,
            organizations: report.organizationIds.length,
          })}
        </p>
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

export default function LearningPage() {
  const translate = useTranslations('pages.adminLearning');
  const [organizationInput, setOrganizationInput] = useState('');
  const [brandId, setBrandId] = useState('');
  const [report, setReport] = useState<LearningPromptSlotOutcomeReport | null>(
    null,
  );
  const [state, setState] = useState<ReportState>('idle');
  const controllerRef = useRef<AbortController | null>(null);
  const getService = useAuthedService((token: string) =>
    AdminLearningPromptSlotsService.getInstance(token),
  );

  const organizationIds = parseOrganizationIds(organizationInput);
  const hasOrganizations = organizationIds.length > 0;

  const loadReport = useCallback(async () => {
    const ids = parseOrganizationIds(organizationInput);
    if (ids.length === 0) {
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState('loading');
    try {
      const service = await getService();
      controller.signal.throwIfAborted();
      const data = await service.getReport(
        { brandId: brandId.trim() || undefined, organizationIds: ids },
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setReport(data);
        setState('ready');
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      logger.error('Failed to load learning prompt slot report', error);
      setState('error');
    }
  }, [brandId, getService, organizationInput]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void loadReport();
    },
    [loadReport],
  );

  return (
    <AdminPageShell
      title={translate('title')}
      icon={Cog}
      onRefresh={hasOrganizations ? loadReport : undefined}
      isRefreshing={state === 'loading'}
    >
      <div className="space-y-6">
        <Form onSubmit={handleSubmit}>
          <Field
            label={translate('form.organizationIds')}
            helpText={translate('form.organizationIdsHelp')}
          >
            <Input
              value={organizationInput}
              onChange={(event) => setOrganizationInput(event.target.value)}
            />
          </Field>
          <Field label={translate('form.brandId')}>
            <Input
              value={brandId}
              onChange={(event) => setBrandId(event.target.value)}
            />
          </Field>
          <div>
            <Button
              type="submit"
              label={translate('form.submit')}
              isDisabled={!hasOrganizations || state === 'loading'}
            />
          </div>
        </Form>
        {state === 'idle' ? (
          <p className="text-sm text-muted-foreground">{translate('idle')}</p>
        ) : state === 'loading' ? (
          <div role="status" aria-label={translate('loading')}>
            <SkeletonCard showImage={false} />
          </div>
        ) : state === 'error' ? (
          <Alert variant="destructive" icon={false}>
            <AlertDescription>{translate('loadFailed')}</AlertDescription>
            <Button
              label={translate('retry')}
              variant={ButtonVariant.SECONDARY}
              onClick={() => void loadReport()}
            />
          </Alert>
        ) : report ? (
          <ReportView report={report} />
        ) : null}
      </div>
    </AdminPageShell>
  );
}
