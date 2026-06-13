import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type {
  AgentApiService,
  WorkflowInterfaceField,
  WorkflowInterfaceSchema,
} from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  type ChangeEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { WorkflowExecuteCardHeader } from './WorkflowExecuteCardHeader';
import { WorkflowExecuteCardInputsForm } from './WorkflowExecuteCardInputsForm';
import { WorkflowExecuteCardStatusPanel } from './WorkflowExecuteCardStatusPanel';
import { WorkflowExecuteCardWorkflowInfo } from './WorkflowExecuteCardWorkflowInfo';

interface WorkflowExecuteCardProps {
  action: AgentUiAction;
  apiService: AgentApiService;
}

type CardStatus = 'idle' | 'executing' | 'done' | 'error';

interface WorkflowInterfaceState {
  formValues: Record<string, unknown>;
  isLoading: boolean;
  workflowId: string | null;
  workflowInterface: WorkflowInterfaceSchema | null;
}

function getInitialValue(field: WorkflowInterfaceField): unknown {
  if (field.defaultValue !== undefined) {
    return field.defaultValue;
  }

  if (field.type === 'boolean') {
    return false;
  }

  return '';
}

function sanitizeInputValues(
  values: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([_, value]) => {
      if (typeof value === 'string') {
        return value.trim().length > 0;
      }

      return value !== undefined && value !== null;
    }),
  );
}

export function WorkflowExecuteCard({
  action,
  apiService,
}: WorkflowExecuteCardProps): ReactElement {
  const { href } = useOrgUrl();
  const workflowId = action.workflowId;
  const currentWorkflowId = workflowId ?? null;
  const workflowName = action.workflowName ?? 'Workflow';
  const [status, setStatus] = useState<CardStatus>('idle');
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [interfaceState, setInterfaceState] = useState<WorkflowInterfaceState>({
    formValues: {},
    isLoading: Boolean(workflowId),
    workflowId: currentWorkflowId,
    workflowInterface: null,
  });
  const abortRef = useRef<AbortController | null>(null);
  const isCurrentInterface = interfaceState.workflowId === currentWorkflowId;
  const workflowInterface = isCurrentInterface
    ? interfaceState.workflowInterface
    : null;
  const isLoadingInterface = isCurrentInterface
    ? interfaceState.isLoading
    : Boolean(workflowId);
  const formValues = isCurrentInterface ? interfaceState.formValues : {};

  useEffect(() => {
    if (!workflowId) {
      return;
    }

    const controller = new AbortController();

    void runAgentApiEffect(
      apiService.getWorkflowInterfaceEffect(workflowId, controller.signal),
    )
      .then((schema) => {
        setInterfaceState({
          formValues: Object.fromEntries(
            Object.entries(schema.inputs ?? {}).map(([key, field]) => [
              key,
              getInitialValue(field),
            ]),
          ),
          isLoading: false,
          workflowId,
          workflowInterface: schema,
        });
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to load workflow interface',
          );
          setInterfaceState((prev) =>
            prev.workflowId === currentWorkflowId
              ? { ...prev, isLoading: false }
              : {
                  formValues: {},
                  isLoading: false,
                  workflowId: currentWorkflowId,
                  workflowInterface: null,
                },
          );
        }
      });

    return () => controller.abort();
  }, [apiService, currentWorkflowId, workflowId]);

  const workflowInputs = workflowInterface?.inputs ?? {};
  const inputEntries = useMemo(
    () => Object.entries(workflowInputs),
    [workflowInputs],
  );
  const hasInputs = inputEntries.length > 0;

  const handleChange = useCallback(
    (key: string, value: unknown) => {
      setInterfaceState((prev) => ({
        ...prev,
        formValues:
          prev.workflowId === currentWorkflowId
            ? { ...prev.formValues, [key]: value }
            : { [key]: value },
        workflowId: currentWorkflowId,
      }));
    },
    [currentWorkflowId],
  );

  const handleTextChange = useCallback(
    (key: string) =>
      (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        handleChange(key, event.target.value);
      },
    [handleChange],
  );

  const handleExecute = useCallback(async () => {
    if (!workflowId) {
      return;
    }

    const missingRequiredField = inputEntries.find(([key, field]) => {
      if (!field.required) {
        return false;
      }

      const value = formValues[key];
      return typeof value === 'string'
        ? value.trim().length === 0
        : value === undefined || value === null;
    });

    if (missingRequiredField) {
      setError(
        `${missingRequiredField[1].label ?? missingRequiredField[0]} is required`,
      );
      setStatus('error');
      return;
    }

    setStatus('executing');
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await runAgentApiEffect(
        apiService.triggerWorkflowEffect(
          workflowId,
          sanitizeInputValues(formValues),
          controller.signal,
        ),
      );
      setExecutionId(result.id);
      setStatus('done');
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        return;
      }
      setError(
        err instanceof Error ? err.message : 'Failed to execute workflow',
      );
      setStatus('error');
    }
  }, [apiService, formValues, inputEntries, workflowId]);

  const handleRetry = useCallback(() => {
    setStatus('idle');
    setError(null);
    setExecutionId(null);
  }, []);

  const executionHref = executionId
    ? href(`/workflows/executions/${executionId}`)
    : null;

  return (
    <div className="my-2 overflow-hidden border border-border bg-background">
      <WorkflowExecuteCardHeader title={action.title || 'Execute Workflow'} />

      <div className="space-y-3 p-3">
        <WorkflowExecuteCardWorkflowInfo
          action={action}
          workflowName={workflowName}
        />

        {isLoadingInterface && (
          <div className="border border-border px-3 py-2 text-xs text-muted-foreground">
            Loading workflow inputs…
          </div>
        )}

        {status === 'idle' && hasInputs && !isLoadingInterface && (
          <WorkflowExecuteCardInputsForm
            inputEntries={inputEntries as [string, WorkflowInterfaceField][]}
            formValues={formValues}
            onTextChange={handleTextChange}
            onChange={handleChange}
          />
        )}

        <WorkflowExecuteCardStatusPanel
          status={status}
          error={error}
          executionId={executionId}
          workflowId={workflowId}
          isLoadingInterface={isLoadingInterface}
          executionHref={executionHref}
          onExecute={handleExecute}
          onRetry={handleRetry}
        />
      </div>
    </div>
  );
}
