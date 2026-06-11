import type {
  IDesktopAgent,
  IDesktopAgentRun,
  IDesktopAgentRunResult,
} from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { DesktopResilienceState } from '@renderer/components/DesktopResilienceState';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

type ManualRunState = {
  agentId: string;
  agentName: string;
  message?: string;
  runId?: string;
  startedAt: string;
  status: IDesktopAgentRunResult['status'];
};

export interface DesktopAgentRunHandoff {
  agentName: string;
  run: IDesktopAgentRun;
}

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

function runStatusLabel(status: IDesktopAgentRun['status']): string {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'queued':
      return 'Queued';
    case 'running':
      return 'Running';
    case 'pending':
      return 'Pending';
  }
}

function formatRunOutput(run: IDesktopAgentRun): string {
  const parts: string[] = [];

  if (run.contentGenerated !== undefined) {
    parts.push(
      `${String(run.contentGenerated)} output${run.contentGenerated === 1 ? '' : 's'}`,
    );
  }

  if (run.creditsUsed !== undefined) {
    parts.push(`${String(run.creditsUsed)} credits`);
  }

  if (run.threadId) {
    parts.push('thread linked');
  }

  return parts.join(' / ');
}

function canHandoffRun(run: IDesktopAgentRun): boolean {
  return Boolean(run.contentGenerated || run.outputSummary || run.threadId);
}

function runTime(run: IDesktopAgentRun): number {
  const timestamp = new Date(run.completedAt ?? run.startedAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isManualRunInFlight(manualRun: ManualRunState | null): boolean {
  return (
    manualRun !== null &&
    ['pending', 'queued', 'running'].includes(manualRun.status)
  );
}

function isMatchingManualRun(
  manualRun: ManualRunState,
  run: IDesktopAgentRun,
): boolean {
  if (manualRun.runId) {
    return manualRun.runId === run.id;
  }

  return runTime(run) >= new Date(manualRun.startedAt).getTime();
}

function AgentManualRunPanel({
  manualRun,
}: {
  manualRun: ManualRunState | null;
}) {
  if (!manualRun) {
    return null;
  }

  return (
    <section className="agent-manual-run-panel panel-card">
      <div className="agent-manual-run-header">
        <div>
          <h3>Manual run status</h3>
          <p className="muted-text">
            {manualRun.agentName} run started {timeAgo(manualRun.startedAt)}.
          </p>
        </div>
        <span className={`status-badge status-${manualRun.status}`}>
          {runStatusLabel(manualRun.status)}
        </span>
      </div>
      {manualRun.message && (
        <p className="agent-run-summary muted-text">{manualRun.message}</p>
      )}
      {manualRun.runId && (
        <p className="muted-text agent-run-handoff-note">
          Cloud run: {manualRun.runId}
        </p>
      )}
    </section>
  );
}

function AgentRunOutput({
  agentName,
  onRunHandoff,
  run,
}: {
  agentName: string;
  onRunHandoff?: (handoff: DesktopAgentRunHandoff) => void;
  run: IDesktopAgentRun;
}) {
  const output = formatRunOutput(run);
  const canHandoff = canHandoffRun(run) && onRunHandoff !== undefined;

  return (
    <div className="agent-run-output">
      <div className="agent-run-output-header">
        <span className={`status-badge status-${run.status}`}>
          {runStatusLabel(run.status)}
        </span>
        <span className="muted-text">
          Started {timeAgo(run.startedAt)}
          {run.completedAt ? ` / finished ${timeAgo(run.completedAt)}` : ''}
        </span>
      </div>

      {output && <p className="agent-run-metrics muted-text">{output}</p>}
      {run.outputSummary && (
        <p className="agent-run-summary muted-text">{run.outputSummary}</p>
      )}

      {canHandoff && (
        <div className="agent-run-actions">
          <Button
            className="small"
            onClick={() => onRunHandoff?.({ agentName, run })}
            type="button"
            variant={ButtonVariant.GHOST}
          >
            Send to composer
          </Button>
        </div>
      )}
    </div>
  );
}

const AgentCard = ({
  agent,
  onRunHandoff,
  onRun,
  runningAgentId,
}: {
  agent: IDesktopAgent;
  onRunHandoff?: (handoff: DesktopAgentRunHandoff) => void;
  onRun: (id: string) => void;
  runningAgentId: string | null;
}) => {
  const [expanded, setExpanded] = useState(false);
  const isRunning = runningAgentId === agent.id;

  return (
    <div className="agent-card panel-card">
      <div className="agent-card-header">
        <div className="agent-card-identity">
          <span className="agent-avatar">
            {agent.avatar ? (
              <Image
                alt={agent.name}
                className="agent-avatar-img"
                height={48}
                src={agent.avatar}
                width={48}
              />
            ) : (
              '🤖'
            )}
          </span>
          <div>
            <strong className="agent-name">{agent.name}</strong>
            <div className="agent-meta">
              <span
                className={`status-badge ${agent.status === 'active' ? 'status-active' : 'status-paused'}`}
              >
                {agent.status}
              </span>
              {isRunning && (
                <span className="status-badge status-generating">
                  Generating…
                </span>
              )}
              {agent.platforms.map((p) => (
                <span className="platform-badge" key={p}>
                  {p}
                </span>
              ))}
              {agent.latestRun && (
                <span
                  className={`status-badge status-${agent.latestRun.status}`}
                >
                  Latest: {agent.latestRun.status}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="agent-card-actions">
          <Button
            className="small"
            disabled={isRunning}
            onClick={() => onRun(agent.id)}
            type="button"
            variant={ButtonVariant.DEFAULT}
          >
            {isRunning ? 'Running…' : '▶ Run'}
          </Button>
        </div>
      </div>

      {agent.lastRunAt && (
        <span className="muted-text agent-last-run">
          Last run: {timeAgo(agent.lastRunAt)}
        </span>
      )}

      {agent.latestRun && (
        <AgentRunOutput
          agentName={agent.name}
          onRunHandoff={onRunHandoff}
          run={agent.latestRun}
        />
      )}

      {agent.recentRuns.length > 0 && (
        <div className="agent-runs-section">
          <Button
            className="small"
            onClick={() => setExpanded(!expanded)}
            type="button"
            variant={ButtonVariant.GHOST}
          >
            {expanded ? '▾ Hide runs' : '▸ View runs'} (
            {String(agent.recentRuns.length)})
          </Button>

          {expanded && (
            <div className="agent-runs-list">
              {agent.recentRuns.map((run) => (
                <div className="agent-run-row" key={run.id}>
                  <span className={`status-badge status-${run.status}`}>
                    {runStatusLabel(run.status)}
                  </span>
                  <span className="muted-text">{timeAgo(run.startedAt)}</span>
                  {formatRunOutput(run) && (
                    <span className="muted-text">{formatRunOutput(run)}</span>
                  )}
                  {canHandoffRun(run) && onRunHandoff && (
                    <Button
                      className="small"
                      onClick={() =>
                        onRunHandoff({ agentName: agent.name, run })
                      }
                      type="button"
                      variant={ButtonVariant.GHOST}
                    >
                      Handoff
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface AgentsViewProps {
  isOnline: boolean;
  onRunHandoff?: (handoff: DesktopAgentRunHandoff) => void;
}

export const AgentsView = ({ isOnline, onRunHandoff }: AgentsViewProps) => {
  const [agents, setAgents] = useState<IDesktopAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualRun, setManualRun] = useState<ManualRunState | null>(null);
  const [runningAgentId, setRunningAgentId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadAgents = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);

    if (!isOnline) {
      setAgents([]);
      if (!options?.silent) {
        setLoading(false);
      }
      return;
    }

    try {
      const result = await window.genfeedDesktop.cloud.listAgents();
      setAgents(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [isOnline]);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  // Poll every 5s while a manually triggered run is waiting on cloud history.
  useEffect(() => {
    if (isManualRunInFlight(manualRun)) {
      pollRef.current = setInterval(() => {
        void loadAgents({ silent: true });
      }, 5000);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [manualRun, loadAgents]);

  useEffect(() => {
    if (!isManualRunInFlight(manualRun)) {
      return;
    }

    const agent = agents.find((item) => item.id === manualRun.agentId);
    const latestRun = agent?.latestRun;

    if (
      !latestRun ||
      !isMatchingManualRun(manualRun, latestRun) ||
      ['pending', 'queued', 'running'].includes(latestRun.status)
    ) {
      return;
    }

    setManualRun({
      ...manualRun,
      ...(latestRun.outputSummary ? { message: latestRun.outputSummary } : {}),
      runId: latestRun.id,
      status: latestRun.status,
    });
  }, [agents, manualRun]);

  const handleRunAgent = useCallback(
    async (agentId: string) => {
      const agent = agents.find((item) => item.id === agentId);
      const startedAt = new Date().toISOString();
      setRunningAgentId(agentId);
      setManualRun({
        agentId,
        agentName: agent?.name ?? 'Agent',
        startedAt,
        status: 'queued',
      });
      setError(null);

      if (!isOnline) {
        setError('Reconnect before running cloud agent strategies.');
        setRunningAgentId(null);
        setManualRun(null);
        return;
      }

      try {
        const result = await window.genfeedDesktop.cloud.runAgent(agentId);
        setManualRun({
          agentId,
          agentName: agent?.name ?? 'Agent',
          ...(result.message ? { message: result.message } : {}),
          ...(result.runId ? { runId: result.runId } : {}),
          startedAt,
          status: result.status,
        });
        await window.genfeedDesktop.notifications.notify(
          'Agent run queued',
          result.message ?? `${agent?.name ?? 'Agent'} will run shortly.`,
        );
        await loadAgents({ silent: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to run agent');
        setManualRun({
          agentId,
          agentName: agent?.name ?? 'Agent',
          message: err instanceof Error ? err.message : 'Failed to run agent',
          startedAt,
          status: 'failed',
        });
      } finally {
        setRunningAgentId(null);
      }
    },
    [agents, isOnline, loadAgents],
  );

  return (
    <div className="view-agents">
      <div className="view-header">
        <h2>Agents</h2>
        <span className="muted-text">{agents.length} agent strategies</span>
        <Button
          className="small"
          onClick={() => void loadAgents()}
          type="button"
          variant={ButtonVariant.GHOST}
        >
          Refresh
        </Button>
      </div>

      {loading && <p className="muted-text">Loading agents...</p>}
      {!loading && isOnline && !error && (
        <AgentManualRunPanel manualRun={manualRun} />
      )}
      {!loading && !isOnline && (
        <DesktopResilienceState
          actionLabel="Retry"
          details="Agent strategies sync from Genfeed Cloud. You can keep drafting locally while the desktop app waits for a connection."
          kind="offline"
          onAction={() => void loadAgents()}
          title="Agents are offline"
        />
      )}
      {!loading && isOnline && error && (
        <DesktopResilienceState
          actionLabel="Retry"
          details={error}
          kind="error"
          onAction={() => void loadAgents()}
          title="Unable to load agents"
        />
      )}

      {!loading && isOnline && !error && agents.length === 0 && (
        <DesktopResilienceState
          details="No agent strategies are available for this account. Create them in the web app, then refresh desktop."
          kind="empty"
          title="No agents configured"
        />
      )}

      {isOnline && !error && agents.length > 0 ? (
        <div className="agents-grid">
          {agents.map((agent) => (
            <AgentCard
              agent={agent}
              key={agent.id}
              onRunHandoff={onRunHandoff}
              onRun={(id) => void handleRunAgent(id)}
              runningAgentId={runningAgentId}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};
