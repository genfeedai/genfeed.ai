import type {
  IDesktopAgent,
  IDesktopAgentRun,
  IDesktopAgentRunResult,
} from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { DesktopResilienceState } from '@renderer/components/DesktopResilienceState';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

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

function isManualRunInFlight(
  manualRun: ManualRunState | null,
): manualRun is ManualRunState {
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
  isCloudConnected,
  onRunHandoff,
  onRun,
  runningAgentId,
}: {
  agent: IDesktopAgent;
  isCloudConnected: boolean;
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
            {isRunning
              ? 'Running…'
              : isCloudConnected
                ? '▶ Run'
                : 'Connect Cloud to run'}
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

type AgentsState = {
  agents: IDesktopAgent[];
  loading: boolean;
  error: string | null;
  manualRun: ManualRunState | null;
  runningAgentId: string | null;
};

type AgentsAction =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; agents: IDesktopAgent[] }
  | { type: 'LOAD_ERROR'; error: string }
  | { type: 'LOAD_SILENT_SUCCESS'; agents: IDesktopAgent[] }
  | { type: 'RUN_START'; agentId: string; agentName: string; startedAt: string }
  | {
      type: 'RUN_QUEUED';
      agentId: string;
      agentName: string;
      startedAt: string;
      message?: string;
      runId?: string;
      status: IDesktopAgentRunResult['status'];
    }
  | {
      type: 'RUN_FAILED';
      agentId: string;
      agentName: string;
      startedAt: string;
      message: string;
    }
  | { type: 'RUN_OFFLINE_ABORT'; error: string }
  | { type: 'RUN_DONE' }
  | { type: 'CLEAR_ERROR' };

function agentsReducer(state: AgentsState, action: AgentsAction): AgentsState {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, loading: true, error: null };
    case 'LOAD_SUCCESS':
      return { ...state, loading: false, agents: action.agents };
    case 'LOAD_ERROR':
      return { ...state, loading: false, error: action.error };
    case 'LOAD_SILENT_SUCCESS':
      return { ...state, agents: action.agents };
    case 'RUN_START':
      return {
        ...state,
        runningAgentId: action.agentId,
        error: null,
        manualRun: {
          agentId: action.agentId,
          agentName: action.agentName,
          startedAt: action.startedAt,
          status: 'queued',
        },
      };
    case 'RUN_QUEUED':
      return {
        ...state,
        manualRun: {
          agentId: action.agentId,
          agentName: action.agentName,
          ...(action.message ? { message: action.message } : {}),
          ...(action.runId ? { runId: action.runId } : {}),
          startedAt: action.startedAt,
          status: action.status,
        },
      };
    case 'RUN_FAILED':
      return {
        ...state,
        error: action.message,
        manualRun: {
          agentId: action.agentId,
          agentName: action.agentName,
          message: action.message,
          startedAt: action.startedAt,
          status: 'failed',
        },
      };
    case 'RUN_OFFLINE_ABORT':
      return {
        ...state,
        error: action.error,
        runningAgentId: null,
        manualRun: null,
      };
    case 'RUN_DONE':
      return { ...state, runningAgentId: null };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    default:
      return state;
  }
}

const initialAgentsState: AgentsState = {
  agents: [],
  loading: true,
  error: null,
  manualRun: null,
  runningAgentId: null,
};

interface AgentsViewProps {
  isCloudConnected: boolean;
  isOnline: boolean;
  onConnectCloud: () => void;
  onRunHandoff?: (handoff: DesktopAgentRunHandoff) => void;
}

export const AgentsView = ({
  isCloudConnected,
  isOnline,
  onConnectCloud,
  onRunHandoff,
}: AgentsViewProps) => {
  const hasDataAccess = isOnline || !isCloudConnected;
  const [state, dispatch] = useReducer(agentsReducer, initialAgentsState);
  const { agents, loading, error, runningAgentId } = state;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Derive the effective manualRun by merging stored state with latest polled agent data.
  // This avoids a self-updating effect (no-derived-state / no-self-updating-effect).
  const manualRun = (() => {
    const stored = state.manualRun;
    if (!stored || !isManualRunInFlight(stored)) {
      return stored;
    }
    const agent = agents.find((item) => item.id === stored.agentId);
    const latestRun = agent?.latestRun;
    if (
      !latestRun ||
      !isMatchingManualRun(stored, latestRun) ||
      ['pending', 'queued', 'running'].includes(latestRun.status)
    ) {
      return stored;
    }
    return {
      ...stored,
      ...(latestRun.outputSummary ? { message: latestRun.outputSummary } : {}),
      runId: latestRun.id,
      status: latestRun.status,
    };
  })();

  const loadAgents = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        dispatch({ type: 'LOAD_START' });
      }

      if (!hasDataAccess) {
        if (!options?.silent) {
          dispatch({ type: 'LOAD_SUCCESS', agents: [] });
        }
        return;
      }

      try {
        const result = await window.genfeedDesktop.cloud.listAgents();
        if (options?.silent) {
          dispatch({ type: 'LOAD_SILENT_SUCCESS', agents: result });
        } else {
          dispatch({ type: 'LOAD_SUCCESS', agents: result });
        }
      } catch (err) {
        if (!options?.silent) {
          dispatch({
            type: 'LOAD_ERROR',
            error: err instanceof Error ? err.message : 'Failed to load agents',
          });
        }
      }
    },
    [hasDataAccess],
  );

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  // Poll every 5s while a manually triggered run is waiting on cloud history.
  // loadAgents is captured via a stable ref so the interval isn't re-created
  // every time the parent redraws (prefer-use-effect-event pattern).
  const loadAgentsRef = useRef(loadAgents);
  loadAgentsRef.current = loadAgents;

  useEffect(() => {
    if (isManualRunInFlight(state.manualRun)) {
      pollRef.current = setInterval(() => {
        void loadAgentsRef.current({ silent: true });
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
  }, [state.manualRun]);

  const handleRunAgent = useCallback(
    async (agentId: string) => {
      if (!isCloudConnected) {
        onConnectCloud();
        return;
      }

      const agent = agents.find((item) => item.id === agentId);
      const startedAt = new Date().toISOString();
      dispatch({
        type: 'RUN_START',
        agentId,
        agentName: agent?.name ?? 'Agent',
        startedAt,
      });

      if (!isOnline) {
        dispatch({
          type: 'RUN_OFFLINE_ABORT',
          error: 'Reconnect before running cloud agent strategies.',
        });
        return;
      }

      try {
        const result = await window.genfeedDesktop.cloud.runAgent(agentId);
        dispatch({
          type: 'RUN_QUEUED',
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
        dispatch({
          type: 'RUN_FAILED',
          agentId,
          agentName: agent?.name ?? 'Agent',
          message: err instanceof Error ? err.message : 'Failed to run agent',
          startedAt,
        });
      } finally {
        dispatch({ type: 'RUN_DONE' });
      }
    },
    [agents, isCloudConnected, isOnline, loadAgents, onConnectCloud],
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
      {!loading && hasDataAccess && !error && (
        <AgentManualRunPanel manualRun={manualRun} />
      )}
      {!loading && !hasDataAccess && (
        <DesktopResilienceState
          actionLabel="Retry"
          details="Agent strategies sync from Genfeed Cloud. You can keep drafting locally while the desktop app waits for a connection."
          kind="offline"
          onAction={() => void loadAgents()}
          title="Agents are offline"
        />
      )}
      {!loading && hasDataAccess && error && (
        <DesktopResilienceState
          actionLabel="Retry"
          details={error}
          kind="error"
          onAction={() => void loadAgents()}
          title="Unable to load agents"
        />
      )}

      {!loading && hasDataAccess && !error && agents.length === 0 && (
        <DesktopResilienceState
          details="No agent strategies are available for this account. Create them in the web app, then refresh desktop."
          kind="empty"
          title="No agents configured"
        />
      )}

      {hasDataAccess && !error && agents.length > 0 ? (
        <div className="agents-grid">
          {agents.map((agent) => (
            <AgentCard
              agent={agent}
              isCloudConnected={isCloudConnected}
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
