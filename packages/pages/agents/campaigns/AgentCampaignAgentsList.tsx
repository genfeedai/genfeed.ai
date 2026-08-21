'use client';

import type { AgentStrategy } from '@services/automation/agent-strategies.service';
import { useTranslations } from 'next-intl';

type Props = {
  agentIds: string[];
  isLoading?: boolean;
  strategies: AgentStrategy[];
};

export default function AgentCampaignAgentsList({
  agentIds,
  isLoading = false,
  strategies,
}: Props) {
  const translate = useTranslations('common.agentCampaign');
  const strategiesById = new Map(
    strategies.map((strategy) => [strategy.id, strategy]),
  );

  return (
    <div className="bg-card p-4 shadow-border">
      <h3 className="mb-4 text-lg font-semibold">
        {translate('agents.title', { count: agentIds.length })}
      </h3>
      {agentIds.length === 0 ? (
        <p className="text-foreground/50">{translate('agents.noneAssigned')}</p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">
          {translate('agents.loadingDetails')}
        </p>
      ) : (
        <div className="space-y-2">
          {agentIds.map((agentId) => {
            const strategy = strategiesById.get(agentId);

            return (
              <div
                key={agentId}
                className="flex items-center justify-between gap-4 bg-secondary p-3"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {strategy?.label ?? translate('agents.unavailable')}
                  </span>
                  <span className="block text-xs uppercase tracking-wide text-muted-foreground">
                    {strategy?.agentType ?? translate('agents.unavailableRole')}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {agentId}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
