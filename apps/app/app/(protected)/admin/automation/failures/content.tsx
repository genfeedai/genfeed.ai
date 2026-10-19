'use client';

import {
  AgentFailureReason,
  type AgentFailureResolution,
  ButtonSize,
  ButtonVariant,
} from '@genfeedai/contracts';
import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { WorkflowExecutionsService } from '@services/automation/workflow-executions.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Alert, AlertDescription } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';
import { useTranslations } from 'next-intl';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
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
  }, [getService, reason, resolution, offset]);

  useEffect(() => {
    refreshFailures();
    return () => requestController.current?.abort();
  }, [refreshFailures]);

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

  return (
    <AdminPageShell
      title={translate('title')}
      onRefresh={refreshFailures}
      isRefreshing={state === 'loading'}
      filters={
        <>
          <Select value={resolution} onValueChange={changeResolution}>
            <SelectTrigger aria-label={translate('resolutionFilter')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RESOLUTIONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {translate(`resolutions.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={reason ?? 'all'} onValueChange={changeReason}>
            <SelectTrigger aria-label={translate('reasonFilter')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{translate('allReasons')}</SelectItem>
              {Object.values(AgentFailureReason).map((value) => (
                <SelectItem key={value} value={value}>
                  {translate(`reasons.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
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
          <CardEmptyContent label={translate('empty')} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{translate('columns.run')}</TableHead>
                <TableHead>{translate('columns.organization')}</TableHead>
                <TableHead>{translate('columns.workflow')}</TableHead>
                <TableHead>{translate('columns.failedAt')}</TableHead>
                <TableHead>{translate('columns.status')}</TableHead>
                <TableHead>{translate('columns.reason')}</TableHead>
                <TableHead>{translate('columns.error')}</TableHead>
                <TableHead>{translate('columns.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {failures.map((run) => {
                const isResolved = Boolean(run.failureResolvedAt);
                const isExpanded = expandedIds.has(run.id);
                const summary =
                  summarizeFailureError(run.error) ||
                  run.failure?.summary ||
                  translate('noError');
                return (
                  <Fragment key={run.id}>
                    <TableRow>
                      <TableCell className="font-mono text-xs" title={run.id}>
                        {run.id}
                      </TableCell>
                      <TableCell title={run.organizationId}>
                        {run.organization?.label ?? run.organizationId}
                      </TableCell>
                      <TableCell>
                        {run.workflow?.label ?? run.workflowId}
                      </TableCell>
                      <TableCell>
                        {new Date(
                          run.completedAt ?? run.createdAt,
                        ).toLocaleString('en-US')}
                      </TableCell>
                      <TableCell>
                        <Badge variant={isResolved ? 'success' : 'warning'}>
                          {translate(
                            `statuses.${isResolved ? 'resolved' : 'open'}`,
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {translate(
                            `reasons.${run.failureReason ?? AgentFailureReason.UNKNOWN}`,
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <p>{summary}</p>
                        <Button
                          label={translate(
                            isExpanded
                              ? 'actions.hideDetails'
                              : 'actions.showDetails',
                          )}
                          variant={ButtonVariant.LINK}
                          size={ButtonSize.XS}
                          onClick={() => toggleExpanded(run.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            label={translate(
                              isResolved
                                ? 'actions.reopen'
                                : 'actions.markResolved',
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
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded ? (
                      <TableRow>
                        <TableCell colSpan={8}>
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
                            {run.failure?.recovery ??
                              translate('recoveryFallback')}
                          </p>
                          <Button
                            className="mt-3"
                            label={translate(
                              copiedId === run.id
                                ? 'actions.copied'
                                : 'actions.copy',
                            )}
                            variant={ButtonVariant.SECONDARY}
                            size={ButtonSize.SM}
                            onClick={() => void copyDetails(run)}
                          />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
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
