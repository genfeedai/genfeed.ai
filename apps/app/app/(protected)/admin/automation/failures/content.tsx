'use client';

import { AgentFailureReason, ButtonVariant } from '@genfeedai/contracts';
import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { WorkflowExecutionsService } from '@services/automation/workflow-executions.service';
import { logger } from '@services/core/logger.service';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import Container from '@ui/layout/container/Container';
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
import { useCallback, useEffect, useRef, useState } from 'react';

export default function AgentFailuresPage() {
  const translate = useTranslations('pages.agentFailures');
  const getService = useAuthedService((token: string) =>
    WorkflowExecutionsService.getInstance(token),
  );
  const [failures, setFailures] = useState<IWorkflowExecution[]>([]);
  const [reason, setReason] = useState<AgentFailureReason>();
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
  }, [getService, reason, offset]);

  useEffect(() => {
    refreshFailures();
    return () => requestController.current?.abort();
  }, [refreshFailures]);

  function changeReason(value: string) {
    setReason(Object.values(AgentFailureReason).find((item) => item === value));
    setOffset(0);
  }

  return (
    <Container
      label={translate('title')}
      description={translate('description')}
      right={
        <Button
          label={translate('refresh')}
          isDisabled={state === 'loading'}
          onClick={refreshFailures}
          variant={ButtonVariant.SECONDARY}
        />
      }
    >
      <WorkspaceSurface title={translate('feed')} tone="muted">
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
                <TableHead>{translate('columns.reason')}</TableHead>
                <TableHead>{translate('columns.error')}</TableHead>
                <TableHead>{translate('columns.recovery')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {failures.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="font-mono text-xs">{run.id}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {run.organizationId}
                  </TableCell>
                  <TableCell>{run.workflow?.label ?? run.workflowId}</TableCell>
                  <TableCell>
                    {new Date(
                      run.completedAt ?? run.createdAt,
                    ).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {translate(
                      `reasons.${run.failureReason ?? AgentFailureReason.UNKNOWN}`,
                    )}
                  </TableCell>
                  <TableCell>
                    <p>
                      {run.failure?.summary ??
                        run.error ??
                        translate('noError')}
                    </p>
                    {run.error &&
                    run.failure?.summary &&
                    run.error !== run.failure.summary ? (
                      <p className="mt-1 whitespace-pre-wrap font-mono text-xs">
                        {run.error}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {run.failure?.recovery ?? translate('recoveryFallback')}
                  </TableCell>
                </TableRow>
              ))}
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
    </Container>
  );
}
