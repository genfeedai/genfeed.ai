'use client';

import {
  AgentFailureReason,
  type AgentFailureResolution,
  ButtonSize,
  ButtonVariant,
} from '@genfeedai/contracts';
import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TableColumn } from '@props/ui/display/table.props';
import { WorkflowExecutionsService } from '@services/automation/workflow-executions.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import Table from '@ui/display/table/Table';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Alert, AlertDescription } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminSearchParam } from '@/components/content/admin-filters/useAdminSearchParam';
import FilterMenu from '@/components/content/filter-menu/FilterMenu';
import SearchField from '@/components/content/search-field/SearchField';
import { WorkspaceSurface } from '@/components/overview/WorkspaceSurface';
import {
  buildFailureClipboardText,
  buildFailureIssueUrl,
  summarizeFailureError,
} from './failure-presentation';

const RESOLUTIONS: AgentFailureResolution[] = ['open', 'resolved', 'all'];

export default function AgentFailuresPage() {
  const translate = useTranslations('pages.agentFailures');
  const getService = useAuthedService((token: string) =>
    WorkflowExecutionsService.getInstance(token),
  );
  const [failures, setFailures] = useState<IWorkflowExecution[]>([]);
  const [reason, setReason] = useState<AgentFailureReason>();
  const [resolution, setResolution] = useState<AgentFailureResolution>('open');
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [pendingId, setPendingId] = useState<string>();
  const [copiedId, setCopiedId] = useState<string>();
  const [offset, setOffset] = useState(0);
  const { search, setSearch } = useAdminSearchParam();
  const requestController = useRef<AbortController | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const refreshFailures = useCallback(() => {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    async function loadFailures() {
      setState('loading');
      try {
        const service = await getService();
        controller.signal.throwIfAborted();
        const result = await service.listAdminFailures(
          reason,
          offset,
          controller.signal,
          resolution,
          search,
        );
        if (!controller.signal.aborted) {
          setFailures(result);
          setState('ready');
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        logger.error('Failed to load agent failures', error);
        setState('error');
      }
    }
    void loadFailures();
  }, [getService, reason, resolution, offset, search]);

  useEffect(() => {
    refreshFailures();
    return () => requestController.current?.abort();
  }, [refreshFailures]);

  function changeSearch(value: string) {
    setSearch(value);
    setOffset(0);
  }

  function changeReason(value: string) {
    setReason(Object.values(AgentFailureReason).find((item) => item === value));
    setOffset(0);
  }

  function changeResolution(value: string) {
    setResolution(RESOLUTIONS.find((item) => item === value) ?? 'open');
    setOffset(0);
  }

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  async function setResolved(run: IWorkflowExecution, isResolved: boolean) {
    setPendingId(run.id);
    try {
      const service = await getService();
      const updated = await service.setAdminFailureResolved(run.id, isResolved);
      setFailures((current) =>
        resolution === 'all'
          ? current.map((item) =>
              item.id === run.id
                ? { ...item, failureResolvedAt: updated.failureResolvedAt }
                : item,
            )
          : current.filter((item) => item.id !== run.id),
      );
    } catch (error) {
      logger.error('Failed to update agent failure', error);
      NotificationsService.getInstance().error(translate('actionError'));
    } finally {
      setPendingId(undefined);
    }
  }

  async function copyDetails(run: IWorkflowExecution) {
    try {
      await navigator.clipboard.writeText(buildFailureClipboardText(run));
      setCopiedId(run.id);
    } catch (error) {
      logger.error('Failed to copy agent failure', error);
    }
  }

  function createIssue(run: IWorkflowExecution) {
    const summary = summarizeFailureError(run.error);
    window.open(
      buildFailureIssueUrl(run, summary),
      '_blank',
      'noopener,noreferrer',
    );
  }

  const columns: TableColumn<IWorkflowExecution>[] = [
    {
      className: 'font-mono text-xs',
      header: translate('columns.run'),
      key: 'id',
    },
    {
      header: translate('columns.organization'),
      key: 'organizationId',
      render: (run) => run.organization?.label ?? run.organizationId,
    },
    {
      header: translate('columns.workflow'),
      key: 'workflowId',
      render: (run) => run.workflow?.label ?? run.workflowId,
    },
    {
      header: translate('columns.failedAt'),
      key: 'completedAt',
      render: (run) =>
        new Date(run.completedAt ?? run.createdAt).toLocaleString('en-US'),
    },
    {
      header: translate('columns.status'),
      key: 'failureResolvedAt',
      render: (run) => (
        <Badge variant={run.failureResolvedAt ? 'success' : 'warning'}>
          {translate(`statuses.${run.failureResolvedAt ? 'resolved' : 'open'}`)}
        </Badge>
      ),
    },
    {
      header: translate('columns.reason'),
      key: 'failureReason',
      render: (run) => (
        <Badge variant="outline">
          {translate(
            `reasons.${run.failureReason ?? AgentFailureReason.UNKNOWN}`,
          )}
        </Badge>
      ),
    },
    {
      className: 'max-w-md',
      header: translate('columns.error'),
      key: 'error',
      render: (run) => (
        <>
          <p>
            {summarizeFailureError(run.error) ||
              run.failure?.summary ||
              translate('noError')}
          </p>
          <Button
            label={translate(
              expandedIds.has(run.id)
                ? 'actions.hideDetails'
                : 'actions.showDetails',
            )}
            variant={ButtonVariant.LINK}
            size={ButtonSize.XS}
            onClick={() => toggleExpanded(run.id)}
          />
        </>
      ),
    },
  ];

  return (
    <AdminPageShell
      title={translate('title')}
      onRefresh={refreshFailures}
      isRefreshing={state === 'loading'}
      search={
        <SearchField
          ariaLabel={translate('search')}
          onSearch={changeSearch}
          placeholder={translate('search')}
          value={search}
        >
          <FilterMenu
            isAttached
            facets={[
              {
                defaultValue: 'open',
                key: 'resolution',
                label: translate('resolutionFilter'),
                onChange: changeResolution,
                options: RESOLUTIONS.map((value) => ({
                  label: translate(`resolutions.${value}`),
                  value,
                })),
                selection: 'single',
                value: resolution,
              },
              {
                defaultValue: 'all',
                key: 'reason',
                label: translate('reasonFilter'),
                onChange: changeReason,
                options: [
                  { label: translate('allReasons'), value: 'all' },
                  ...Object.values(AgentFailureReason).map((value) => ({
                    label: translate(`reasons.${value}`),
                    value,
                  })),
                ],
                selection: 'single',
                value: reason ?? 'all',
              },
            ]}
            onClear={() => {
              changeResolution('open');
              changeReason('all');
            }}
          />
        </SearchField>
      }
    >
      <WorkspaceSurface
        framed={state === 'ready' && failures.length > 0}
        tone="muted"
      >
        {state === 'loading' ? (
          <LazyLoadingFallback variant="grid" />
        ) : state === 'error' ? (
          <Alert variant="destructive">
            <AlertDescription>{translate('loadError')}</AlertDescription>
            <Button label={translate('retry')} onClick={refreshFailures} />
          </Alert>
        ) : failures.length === 0 ? (
          <CardEmptyContent
            label={translate(search ? 'emptySearch' : 'empty')}
          />
        ) : (
          <Table<IWorkflowExecution>
            ariaLabel={translate('title')}
            columns={columns}
            framed={false}
            getRowKey={(run) => run.id}
            items={failures}
            renderRowActions={(run) => {
              const isResolved = Boolean(run.failureResolvedAt);
              return (
                <>
                  <Button
                    label={translate(
                      isResolved ? 'actions.reopen' : 'actions.markResolved',
                    )}
                    variant={ButtonVariant.SECONDARY}
                    size={ButtonSize.SM}
                    isLoading={pendingId === run.id}
                    onClick={() => void setResolved(run, !isResolved)}
                  />
                  <Button
                    label={translate('actions.createIssue')}
                    variant={ButtonVariant.SECONDARY}
                    size={ButtonSize.SM}
                    onClick={() => createIssue(run)}
                  />
                </>
              );
            }}
            renderExpandedRow={(run) =>
              expandedIds.has(run.id) ? (
                <div>
                  <p className="text-xs font-medium">
                    {translate('fullError')}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words font-mono text-xs">
                    {run.error ?? translate('noError')}
                  </p>
                  <p className="mt-3 text-xs font-medium">
                    {translate('recovery')}
                  </p>
                  <p className="mt-1 text-xs">
                    {run.failure?.recovery ?? translate('recoveryFallback')}
                  </p>
                  <Button
                    className="mt-3"
                    label={translate(
                      copiedId === run.id ? 'actions.copied' : 'actions.copy',
                    )}
                    variant={ButtonVariant.SECONDARY}
                    size={ButtonSize.SM}
                    onClick={() => void copyDetails(run)}
                  />
                </div>
              ) : undefined
            }
          />
        )}
        <Button
          label={translate('previous')}
          variant={ButtonVariant.SECONDARY}
          isDisabled={offset === 0 || state === 'loading'}
          onClick={() => setOffset((value) => Math.max(0, value - 20))}
        />
        <Button
          label={translate('next')}
          variant={ButtonVariant.SECONDARY}
          isDisabled={state !== 'ready' || failures.length < 20}
          onClick={() => setOffset((value) => value + 20)}
        />
      </WorkspaceSurface>
    </AdminPageShell>
  );
}
