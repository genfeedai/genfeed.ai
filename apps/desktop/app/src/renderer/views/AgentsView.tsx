import type { IDesktopAgent } from '@genfeedai/desktop-contracts';
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
              <img
                alt={agent.name}
                className="agent-avatar-img"
                src={agent.avatar}
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
                  Generating...
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
          <button
            className="primary-button small"
            disabled={isRunning}
            onClick={() => onRun(agent.id)}
            type="button"
          >
            {isRunning ? 'Running...' : '▶ Run'}
          </button>
        </div>
      </div>

      {agent.lastRunAt && (
        <span className="muted-text agent-last-run">
          Last run: {timeAgo(agent.lastRunAt)}
        </span>
      )}

      {agent.recentRuns.length > 0 && (
        <div className="agent-runs-section">
          <button
            className="ghost-button small"
            onClick={() => setExpanded(!expanded)}
            type="button"
          >
            {expanded ? '▾ Hide runs' : '▸ View runs'} (
            {String(agent.recentRuns.length)})
          </button>

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

export const AgentsView = () => {
  const [agents, setAgents] = useState<IDesktopAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningAgentId, setRunningAgentId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadAgents = useCallback(async () => {
    try {
      const result = await window.genfeedDesktop.cloud.listAgents();
      setAgents(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, []);

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
    [loadAgents],
  );

  return (
    <div className="view-agents">
      <div className="view-header">
        <h2>Agents</h2>
        <span className="muted-text">{agents.length} agent strategies</span>
        <button
          className="ghost-button small"
          onClick={() => void loadAgents()}
          type="button"
        >
          Refresh
        </button>
      </div>

      {loading && <p className="muted-text">Loading agents...</p>}
      {error && <div className="error-banner">{error}</div>}

      {!loading && agents.length === 0 && (
        <p className="empty-state">
          No agents configured. Create agent strategies in the GenFeed web app.
        </p>
      )}

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
    </div>
  );
};
