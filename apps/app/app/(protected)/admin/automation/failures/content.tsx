'use client';

import {
  AgentFailureReason,
  ButtonVariant,
  formatEnumLabel,
} from '@genfeedai/contracts';
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
import { useCallback, useEffect, useRef, useState } from 'react';

export default function AgentFailuresPage() {
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
      label="Agent Failures"
      description="Failed agent runs across all organizations, with recovery guidance."
      right={
        <Button
          label="Refresh"
          isDisabled={state === 'loading'}
          onClick={refreshFailures}
          variant={ButtonVariant.SECONDARY}
        />
      }
    >
      <WorkspaceSurface title="Failure feed" tone="muted">
        <Select value={reason ?? 'all'} onValueChange={changeReason}>
          <SelectTrigger aria-label="Failure reason">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All reasons</SelectItem>
            {Object.values(AgentFailureReason).map((value) => (
              <SelectItem key={value} value={value}>
                {formatEnumLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {state === 'loading' ? (
          <LazyLoadingFallback variant="grid" />
        ) : state === 'error' ? (
          <Alert variant="destructive">
            <AlertDescription>
              Agent failures could not be loaded.
            </AlertDescription>
            <Button label="Retry" onClick={refreshFailures} />
          </Alert>
        ) : failures.length === 0 ? (
          <CardEmptyContent label="No agent failures found" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Workflow</TableHead>
                <TableHead>Failed at</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Error</TableHead>
                <TableHead>Recovery</TableHead>
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
                    {formatEnumLabel(
                      run.failureReason ?? AgentFailureReason.UNKNOWN,
                    )}
                  </TableCell>
                  <TableCell>
                    {run.failure?.summary ??
                      run.error ??
                      'No error details recorded'}
                  </TableCell>
                  <TableCell>
                    {run.failure?.recovery ??
                      'Review the execution details before retrying.'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Button
          label="Previous"
          variant={ButtonVariant.SECONDARY}
          isDisabled={offset === 0 || state === 'loading'}
          onClick={() => setOffset((value) => Math.max(0, value - 20))}
        />
        <Button
          label="Next"
          variant={ButtonVariant.SECONDARY}
          isDisabled={state !== 'ready' || failures.length < 20}
          onClick={() => setOffset((value) => value + 20)}
        />
      </WorkspaceSurface>
    </Container>
  );
}
