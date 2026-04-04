'use client';

import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  XCircle,
} from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import { useWorkflowStore } from '@/store/workflowStore';

// =============================================================================
// TYPES
// =============================================================================

interface ExecutionJobCost {
  nodeId: string;
  nodeType: string;
  predictionId: string;
  status: string;
  cost: number;
}

interface ExecutionHistoryItem {
  _id: string;
  workflowId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  estimatedCost: number;
  actualCost: number;
  startedAt: string;
  completedAt?: string;
  jobCosts?: ExecutionJobCost[];
}

interface ExecutionsResponse {
  data: ExecutionHistoryItem[];
  total: number;
}

// Maximum cache size to prevent memory leaks
const MAX_CACHE_SIZE = 50;

// =============================================================================
// HELPERS
// =============================================================================

function formatCost(cost: number | undefined): string {
  if (cost === undefined || cost === null) {
    return '-';
  }
  if (cost < 0.01) {
    return '<$0.01';
  }
  return `$${cost.toFixed(2)}`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  });
}

function getStatusIcon(status: string): React.ReactNode {
  const iconClass = 'h-4 w-4';
  switch (status) {
    case 'completed':
      return <CheckCircle className={`${iconClass} text-green-400`} />;
    case 'failed':
      return <XCircle className={`${iconClass} text-red-400`} />;
    case 'processing':
      return <Loader2 className={`${iconClass} text-blue-400 animate-spin`} />;
    case 'cancelled':
      return <AlertCircle className={`${iconClass} text-yellow-400`} />;
    default:
      return <Clock className={`${iconClass} text-muted-foreground`} />;
  }
}

function getVarianceColor(variance: number): string {
  if (variance > 10) return 'text-red-400';
  if (variance < -10) return 'text-green-400';
  return 'text-muted-foreground';
}

// =============================================================================
// EXECUTION ROW
// =============================================================================

interface ExecutionRowProps {
  execution: ExecutionHistoryItem;
  onLoadDetails: (executionId: string, signal: AbortSignal) => Promise<ExecutionJobCost[]>;
}

const ExecutionRow = memo(function ExecutionRow({ execution, onLoadDetails }: ExecutionRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [jobCosts, setJobCosts] = useState<ExecutionJobCost[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const variance =
    execution.actualCost > 0 && execution.estimatedCost > 0
      ? ((execution.actualCost - execution.estimatedCost) / execution.estimatedCost) * 100
      : null;

  const handleExpand = async () => {
    // Toggle expansion regardless of loading state
    const willExpand = !isExpanded;
    setIsExpanded(willExpand);

    // Only load if expanding and no cached data
    if (willExpand && !jobCosts && !isLoading) {
      // Cancel any pending request
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      try {
        const costs = await onLoadDetails(execution._id, controller.signal);
        if (!controller.signal.aborted) {
          setJobCosts(costs);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }
  };

  return (
    <div className="rounded-lg border border-border">
      <button
        onClick={handleExpand}
        className="flex w-full items-center justify-between p-3 text-left transition hover:bg-secondary/30"
      >
        <div className="flex items-center gap-3">
          {getStatusIcon(execution.status)}
          <div>
            <div className="text-sm font-medium text-foreground">
              {formatDate(execution.startedAt)}
            </div>
            <div className="text-xs capitalize text-muted-foreground">{execution.status}</div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Estimated</div>
            <div className="text-sm font-medium text-foreground">
              {formatCost(execution.estimatedCost)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Actual</div>
            <div className="text-sm font-medium text-foreground">
              {formatCost(execution.actualCost)}
            </div>
          </div>
          {variance !== null && (
            <div className={`text-sm font-medium ${getVarianceColor(variance)}`}>
              {variance > 0 ? '+' : ''}
              {variance.toFixed(1)}%
            </div>
          )}
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {isExpanded && jobCosts && (
        <div className="border-t border-border">
          {jobCosts.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">No job cost data</div>
          ) : (
            <div className="divide-y divide-border/50">
              {jobCosts.map((job, index) => (
                <div
                  key={job.predictionId || index}
                  className="flex items-center justify-between px-4 py-2"
                >
                  <div className="flex flex-col">
                    <span className="text-sm text-foreground">{job.nodeType}</span>
                    <span className="text-xs text-muted-foreground">
                      {job.predictionId.slice(0, 8)}...
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusIcon(job.status)}
                    <span className="text-sm font-medium text-foreground">
                      {formatCost(job.cost)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// =============================================================================
// MAIN COMPONENT
// =============================================================================

function ExecutionHistoryTabComponent() {
  // Subscribe only to workflowId to avoid re-renders on unrelated store changes
  const workflowId = useWorkflowStore((state) => state.workflowId);
  const [executions, setExecutions] = useState<ExecutionHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use ref for cache to avoid re-creating loadCostDetails on every cache update
  // This prevents the race condition where cache updates trigger callback recreation
  const costCacheRef = useRef<Map<string, ExecutionJobCost[]>>(new Map());

  // Load executions on mount
  useEffect(() => {
    if (!workflowId) return;

    const controller = new AbortController();

    async function loadExecutions() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await apiClient.get<ExecutionsResponse>(
          `/workflows/${workflowId}/executions?limit=20`,
          { signal: controller.signal }
        );
        setExecutions(response.data ?? []);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load executions');
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadExecutions();

    return () => controller.abort();
  }, [workflowId]);

  // Clear cache when workflowId changes to prevent stale data
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset cache on workflowId change
  useEffect(() => {
    costCacheRef.current = new Map();
  }, [workflowId]);

  // Load cost details for an execution - stable callback that doesn't depend on cache state
  const loadCostDetails = useCallback(
    async (executionId: string, signal: AbortSignal): Promise<ExecutionJobCost[]> => {
      // Check cache first
      const cached = costCacheRef.current.get(executionId);
      if (cached) return cached;

      try {
        const costs = await apiClient.get<ExecutionJobCost[]>(`/executions/${executionId}/costs`, {
          signal,
        });

        if (signal.aborted) return [];

        // Evict oldest entries if cache is too large (LRU-style eviction)
        if (costCacheRef.current.size >= MAX_CACHE_SIZE) {
          const firstKey = costCacheRef.current.keys().next().value;
          if (firstKey) {
            costCacheRef.current.delete(firstKey);
          }
        }

        costCacheRef.current.set(executionId, costs);
        return costs;
      } catch {
        return [];
      }
    },
    [] // No dependencies - uses ref for cache
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-center">
        <AlertCircle className="mx-auto h-6 w-6 text-red-400" />
        <div className="mt-2 text-sm text-red-400">{error}</div>
      </div>
    );
  }

  // Empty state
  if (executions.length === 0) {
    return (
      <div className="rounded-lg border border-border p-8 text-center">
        <Clock className="mx-auto h-8 w-8 text-muted-foreground" />
        <div className="mt-3 text-muted-foreground">No execution history</div>
        <p className="mt-2 text-sm text-muted-foreground">
          Run your workflow to see execution costs here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Recent Executions</h3>
        <span className="text-xs text-muted-foreground">{executions.length} total</span>
      </div>

      <div className="space-y-2">
        {executions.map((execution) => (
          <ExecutionRow key={execution._id} execution={execution} onLoadDetails={loadCostDetails} />
        ))}
      </div>
    </div>
  );
}

export const ExecutionHistoryTab = memo(ExecutionHistoryTabComponent);
