import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { CircleCheck, Megaphone, Pause, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

interface CampaignCardProps {
  action: AgentUiAction;
}

const CAMPAIGN_STATUS_CONFIG: Record<
  string,
  { color: string; icon: ReactElement; label: string }
> = {
  active: {
    color: 'text-green-500',
    icon: <Play className="size-4" />,
    label: 'Active',
  },
  completed: {
    color: 'text-blue-500',
    icon: <CircleCheck className="size-4" />,
    label: 'Completed',
  },
  paused: {
    color: 'text-yellow-500',
    icon: <Pause className="size-4" />,
    label: 'Paused',
  },
};

export function CampaignCreateCard({
  action,
}: CampaignCardProps): ReactElement {
  const translate = useTranslations('agent.outreachSequence');

  return (
    <div className="border border-border bg-background p-4 my-2">
      <div className="flex items-center gap-2 mb-3">
        <Megaphone className="size-5 text-orange-500" />
        <h3 className="font-semibold text-sm">
          {action.title || translate('newTitle')}
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
              className="text-xs px-3 py-1.5 rounded bg-warning/10  text-warning  hover:bg-warning/10 transition-colors"
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
  const translate = useTranslations('agent.outreachSequence');
  const status = action.status || 'active';
  const config =
    CAMPAIGN_STATUS_CONFIG[status] || CAMPAIGN_STATUS_CONFIG.active;

  return (
    <div className="border border-border bg-background p-4 my-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Megaphone className="size-5 text-orange-500" />
          <h3 className="font-semibold text-sm">
            {action.title || translate('fallbackTitle')}
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
                className={`text-xs px-3 py-1.5 transition-colors ${
                  isDestructive
                    ? 'bg-destructive/10  text-destructive  hover:bg-destructive/10'
                    : 'bg-warning/10  text-warning  hover:bg-warning/10'
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
