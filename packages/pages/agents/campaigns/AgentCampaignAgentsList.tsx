'use client';

type Props = {
  agents: string[];
};

export default function AgentCampaignAgentsList({ agents }: Props) {
  return (
    <div className="border border-white/[0.08] bg-background p-4">
      <h3 className="mb-4 text-lg font-semibold">
        Agent Strategies ({agents.length})
      </h3>
      {agents.length === 0 ? (
        <p className="text-foreground/50">
          No agent strategies assigned to this campaign yet.
        </p>
      ) : (
        <div className="space-y-2">
          {agents.map((agentId) => (
            <div
              key={agentId}
              className="flex items-center justify-between border border-white/[0.04] p-3"
            >
              <span className="text-sm font-mono text-foreground/70">
                {agentId}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
