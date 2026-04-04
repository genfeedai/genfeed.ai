import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type {
  AgentApiService,
  WorkflowInterfaceField,
  WorkflowInterfaceSchema,
} from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import {
  type ChangeEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  HiCheckCircle,
  HiCurrencyDollar,
  HiExclamationCircle,
  HiOutlineBolt,
} from 'react-icons/hi2';

interface WorkflowExecuteCardProps {
  action: AgentUiAction;
  apiService: AgentApiService;
}

type CardStatus = 'idle' | 'executing' | 'done' | 'error';

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
  const workflowId = action.workflowId;
  const workflowName = action.workflowName ?? 'Workflow';
  const [status, setStatus] = useState<CardStatus>('idle');
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workflowInterface, setWorkflowInterface] =
    useState<WorkflowInterfaceSchema | null>(null);
  const [isLoadingInterface, setIsLoadingInterface] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!workflowId) {
      setWorkflowInterface(null);
      setFormValues({});
      return;
    }

    const controller = new AbortController();
    setIsLoadingInterface(true);

    void runAgentApiEffect(
      apiService.getWorkflowInterfaceEffect(workflowId, controller.signal),
    )
      .then((schema) => {
        setWorkflowInterface(schema);
        setFormValues(
          Object.fromEntries(
            Object.entries(schema.inputs ?? {}).map(([key, field]) => [
              key,
              getInitialValue(field),
            ]),
          ),
        );
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to load workflow interface',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingInterface(false);
        }
      });

    return () => controller.abort();
  }, [apiService, workflowId]);

  const workflowInputs = workflowInterface?.inputs ?? {};
  const inputEntries = useMemo(
    () => Object.entries(workflowInputs),
    [workflowInputs],
  );
  const hasInputs = inputEntries.length > 0;

  const handleChange = useCallback((key: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  }, []);

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

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <HiOutlineBolt className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-foreground">
          {action.title || 'Execute Workflow'}
        </span>
      </div>

      <div className="space-y-3 p-3">
        <div className="rounded border border-border p-2.5">
          <span className="text-sm font-medium text-foreground">
            {workflowName}
          </span>
          {action.workflowDescription && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {action.workflowDescription}
            </p>
          )}
        </div>

        {action.description && (
          <p className="text-xs text-muted-foreground">{action.description}</p>
        )}

        {action.creditEstimate != null && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <HiCurrencyDollar className="h-3.5 w-3.5" />
            <span>Estimated cost: {action.creditEstimate} credits</span>
          </div>
        )}

        {isLoadingInterface && (
          <div className="rounded border border-border px-3 py-2 text-xs text-muted-foreground">
            Loading workflow inputs...
          </div>
        )}

        {status === 'idle' && hasInputs && !isLoadingInterface && (
          <div className="space-y-3 rounded border border-border p-3">
            {inputEntries.map(([key, field]) => {
              const label = field.label ?? key;
              const value = formValues[key];
              const commonClassName =
                'w-full rounded border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';

              return (
                <div key={key}>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {label}
                    {field.required ? ' *' : ''}
                  </label>
                  {field.description && (
                    <p className="mb-1 text-xs text-muted-foreground">
                      {field.description}
                    </p>
                  )}
                  {field.type === 'boolean' ? (
                    <label className="flex items-center gap-2 rounded border border-border px-2.5 py-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={Boolean(value)}
                        onChange={(event) =>
                          handleChange(key, event.target.checked)
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ) : field.type === 'select' &&
                    Array.isArray(field.validation?.options) ? (
                    <select
                      value={typeof value === 'string' ? value : ''}
                      onChange={(event) =>
                        handleChange(key, event.target.value)
                      }
                      className={commonClassName}
                    >
                      {!field.required && <option value="">Optional</option>}
                      {field.validation.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : field.type === 'number' ? (
                    <input
                      type="number"
                      value={
                        typeof value === 'number' || typeof value === 'string'
                          ? value
                          : ''
                      }
                      onChange={(event) =>
                        handleChange(key, event.target.value)
                      }
                      className={commonClassName}
                    />
                  ) : field.type === 'text' &&
                    key.toLowerCase().includes('script') ? (
                    <textarea
                      rows={3}
                      value={typeof value === 'string' ? value : ''}
                      onChange={handleTextChange(key)}
                      className={`${commonClassName} resize-none`}
                    />
                  ) : (
                    <input
                      type="text"
                      value={typeof value === 'string' ? value : ''}
                      onChange={handleTextChange(key)}
                      className={commonClassName}
                      placeholder={
                        field.type === 'image' || field.type === 'audio'
                          ? 'https://...'
                          : undefined
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {status === 'idle' && (
          <button
            type="button"
            onClick={handleExecute}
            disabled={!workflowId || isLoadingInterface}
            className="flex w-full items-center justify-center gap-2 rounded bg-primary px-4 py-2 text-sm font-black text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <HiOutlineBolt className="h-4 w-4" />
            Execute
          </button>
        )}

        {status === 'executing' && (
          <div className="flex items-center justify-center gap-2 rounded border border-border px-4 py-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm text-muted-foreground">
              Executing workflow...
            </span>
          </div>
        )}

        {status === 'done' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded border border-green-200 bg-green-50 px-3 py-2 dark:border-green-800 dark:bg-green-950">
              <HiCheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="text-sm text-green-700 dark:text-green-300">
                Workflow executed successfully
              </span>
            </div>
            {executionId && (
              <a
                href={`/workflows/executions/${executionId}`}
                className="flex w-full items-center justify-center gap-1 rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                View Execution
              </a>
            )}
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 dark:border-red-800 dark:bg-red-950">
              <HiExclamationCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              <span className="text-sm text-red-700 dark:text-red-300">
                {error}
              </span>
            </div>
            <button
              type="button"
              onClick={handleRetry}
              className="flex w-full items-center justify-center rounded border border-border px-4 py-2 text-sm font-black text-foreground transition-colors hover:bg-accent"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
