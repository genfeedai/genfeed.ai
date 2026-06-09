import type { IDesktopAgent } from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { DesktopResilienceState } from '@renderer/components/DesktopResilienceState';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

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

const AgentCard = ({
  agent,
  onRun,
  runningAgentId,
}: {
  agent: IDesktopAgent;
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
                    {run.status}
                  </span>
                  <span className="muted-text">{timeAgo(run.startedAt)}</span>
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
}

export const AgentsView = ({ isOnline }: AgentsViewProps) => {
  const [agents, setAgents] = useState<IDesktopAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningAgentId, setRunningAgentId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!isOnline) {
      setAgents([]);
      setLoading(false);
      return;
    }

    try {
      const result = await window.genfeedDesktop.cloud.listAgents();
      setAgents(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  // Poll every 5s while a run is in progress
  useEffect(() => {
    if (runningAgentId) {
      pollRef.current = setInterval(() => {
        void loadAgents();
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
  }, [runningAgentId, loadAgents]);

  const handleRunAgent = useCallback(
    async (agentId: string) => {
      setRunningAgentId(agentId);
      setError(null);

      if (!isOnline) {
        setError('Reconnect before running cloud agent strategies.');
        setRunningAgentId(null);
        return;
      }

      try {
        await window.genfeedDesktop.cloud.runAgent(agentId);
        // Keep polling; it will auto-clear when run completes
        setTimeout(() => {
          void loadAgents().then(() => setRunningAgentId(null));
        }, 10000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to run agent');
        setRunningAgentId(null);
      }
    },
    [isOnline, loadAgents],
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
              onRun={(id) => void handleRunAgent(id)}
              runningAgentId={runningAgentId}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};
