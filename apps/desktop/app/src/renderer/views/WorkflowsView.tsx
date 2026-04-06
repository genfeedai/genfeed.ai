import type { IDesktopWorkflow } from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { useCallback, useEffect, useState } from 'react';

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}h ago`;
  const days = Math.floor(hours / 24);
  return `${String(days)}d ago`;
}

const LIFECYCLE_COLORS: Record<string, string> = {
  archived: 'status-paused',
  draft: 'status-pending',
  published: 'status-active',
};

export const WorkflowsView = () => {
  const [workflows, setWorkflows] = useState<IDesktopWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const loadWorkflows = useCallback(async () => {
    try {
      const result = await window.genfeedDesktop.cloud.listWorkflows();
      setWorkflows(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflows');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkflows();
  }, [loadWorkflows]);

  const handleRun = useCallback(async (workflowId: string, batch?: boolean) => {
    setRunningId(workflowId);
    setError(null);

    try {
      await window.genfeedDesktop.cloud.runWorkflow({ batch, workflowId });
      await window.genfeedDesktop.notifications.notify(
        'Workflow started',
        `Workflow ${batch ? 'batch ' : ''}execution started.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run workflow');
    } finally {
      setRunningId(null);
    }
  }, []);

  return (
    <div className="view-workflows">
      <div className="view-header">
        <h2>Automations</h2>
        <span className="muted-text">{workflows.length} workflows</span>
        <Button
          className="small"
          onClick={() => void loadWorkflows()}
          type="button"
          variant={ButtonVariant.GHOST}
        >
          Refresh
        </Button>
      </div>

      {loading && <p className="muted-text">Loading workflows...</p>}
      {error && <div className="error-banner">{error}</div>}

      {!loading && workflows.length === 0 && (
        <p className="empty-state">
          No workflows found. Create workflows in the GenFeed workflow builder.
        </p>
      )}

      <div className="workflows-grid">
        {workflows.map((wf) => (
          <div className="workflow-card panel-card" key={wf.id}>
            <div className="workflow-card-header">
              <div>
                <strong className="workflow-name">{wf.name}</strong>
                {wf.description && (
                  <p className="workflow-desc muted-text">{wf.description}</p>
                )}
              </div>
              <span
                className={`status-badge ${LIFECYCLE_COLORS[wf.lifecycle] ?? ''}`}
              >
                {wf.lifecycle}
              </span>
            </div>

            <div className="workflow-meta">
              <span className="node-count-badge">
                {String(wf.nodeCount)} node{wf.nodeCount !== 1 ? 's' : ''}
              </span>
              {wf.latestRun && (
                <span className={`status-badge status-${wf.latestRun.status}`}>
                  {wf.latestRun.mode === 'batch' ? 'Batch' : 'Latest'}:{' '}
                  {wf.latestRun.status}
                </span>
              )}
              {wf.lastExecutedAt && (
                <span className="muted-text">
                  Last run: {timeAgo(wf.lastExecutedAt)}
                </span>
              )}
            </div>

            <div className="workflow-card-actions">
              <Button
                className="small"
                disabled={runningId === wf.id}
                onClick={() => void handleRun(wf.id)}
                type="button"
                variant={ButtonVariant.DEFAULT}
              >
                {runningId === wf.id ? 'Running...' : '▶ Run'}
              </Button>
              {wf.supportsBatch && (
                <Button
                  className="small"
                  disabled={runningId === wf.id}
                  onClick={() => void handleRun(wf.id, true)}
                  type="button"
                  variant={ButtonVariant.GHOST}
                >
                  📦 Run Batch
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
