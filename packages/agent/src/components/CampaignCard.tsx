import type { AgentUiAction } from '@cloud/agent/models/agent-chat.model';
import type { ReactElement } from 'react';
import { HiCheckCircle, HiMegaphone, HiPause, HiPlay } from 'react-icons/hi2';

interface CampaignCardProps {
  action: AgentUiAction;
}

export function CampaignCreateCard({
  action,
}: CampaignCardProps): ReactElement {
  return (
    <div className="rounded-lg border border-border bg-background p-4 my-2">
      <div className="flex items-center gap-2 mb-3">
        <HiMegaphone className="w-5 h-5 text-orange-500" />
        <h3 className="font-semibold text-sm">
          {action.title || 'New Campaign'}
        </h3>
      </div>
      {action.description && (
        <p className="text-xs text-muted-foreground mb-3">
          {action.description}
        </p>
      )}
      {action.ctas && action.ctas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {action.ctas.map((cta) => (
            <a
              key={cta.label}
              href={cta.href}
              className="text-xs px-3 py-1.5 rounded bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 hover:bg-orange-100 transition-colors"
            >
              {cta.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function CampaignControlCard({
  action,
}: CampaignCardProps): ReactElement {
  const status = action.status || 'active';

  const statusConfig: Record<
    string,
    { color: string; icon: ReactElement; label: string }
  > = {
    active: {
      color: 'text-green-500',
      icon: <HiPlay className="w-4 h-4" />,
      label: 'Active',
    },
    completed: {
      color: 'text-blue-500',
      icon: <HiCheckCircle className="w-4 h-4" />,
      label: 'Completed',
    },
    paused: {
      color: 'text-yellow-500',
      icon: <HiPause className="w-4 h-4" />,
      label: 'Paused',
    },
  };

  const config = statusConfig[status] || statusConfig.active;

  return (
    <div className="rounded-lg border border-border bg-background p-4 my-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <HiMegaphone className="w-5 h-5 text-orange-500" />
          <h3 className="font-semibold text-sm">
            {action.title || 'Campaign'}
          </h3>
        </div>
        <span
          className={`flex items-center gap-1 text-xs font-medium ${config.color}`}
        >
          {config.icon}
          {config.label}
        </span>
      </div>
      {action.description && (
        <p className="text-xs text-muted-foreground mb-3">
          {action.description}
        </p>
      )}
      {action.ctas && action.ctas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {action.ctas.map((cta) => {
            const isDestructive =
              cta.label.toLowerCase().includes('stop') ||
              cta.label.toLowerCase().includes('pause');
            return (
              <a
                key={cta.label}
                href={cta.href}
                className={`text-xs px-3 py-1.5 rounded transition-colors ${
                  isDestructive
                    ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100'
                    : 'bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 hover:bg-orange-100'
                }`}
              >
                {cta.label}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
