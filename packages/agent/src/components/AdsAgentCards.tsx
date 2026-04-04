import type { AgentUiAction } from '@cloud/agent/models/agent-chat.model';
import Link from 'next/link';
import type { ReactElement } from 'react';
import {
  HiArrowTopRightOnSquare,
  HiChartBar,
  HiMegaphone,
  HiRocketLaunch,
} from 'react-icons/hi2';

interface AgentCardProps {
  action: AgentUiAction;
}

function CardCtas({ action }: AgentCardProps): ReactElement | null {
  if (!action.ctas || action.ctas.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {action.ctas.map((cta, index) =>
        cta.href ? (
          <Link
            key={`${action.id}-cta-${index}`}
            href={cta.href}
            className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            {cta.label}
            <HiArrowTopRightOnSquare className="h-3.5 w-3.5" />
          </Link>
        ) : null,
      )}
    </div>
  );
}

export function AdsSearchResultsCard({ action }: AgentCardProps): ReactElement {
  return (
    <div className="my-2 rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <HiMegaphone className="h-5 w-5 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">
          {action.title || 'Ads search results'}
        </h3>
      </div>
      {action.description ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {action.description}
        </p>
      ) : null}
      <div className="space-y-2">
        {action.items?.map((item) => (
          <div
            key={item.id}
            className="rounded border border-border bg-card/40 p-3"
          >
            <div className="text-sm font-medium text-foreground">
              {item.title}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {[item.platform, item.type].filter(Boolean).join(' / ')}
            </div>
          </div>
        ))}
      </div>
      <CardCtas action={action} />
    </div>
  );
}

export function AdDetailSummaryCard({ action }: AgentCardProps): ReactElement {
  const data = action.data ?? {};

  return (
    <div className="my-2 rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <HiChartBar className="h-5 w-5 text-blue-500" />
        <h3 className="text-sm font-semibold text-foreground">
          {action.title || 'Ad detail summary'}
        </h3>
      </div>
      {action.description ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {action.description}
        </p>
      ) : null}
      <div className="space-y-2 rounded border border-border bg-card/40 p-3">
        <div className="text-sm text-foreground">
          {(data.headline as string | undefined) || 'Selected ad'}
        </div>
        {typeof data.explanation === 'string' ? (
          <p className="text-xs text-muted-foreground">{data.explanation}</p>
        ) : null}
      </div>
      <CardCtas action={action} />
    </div>
  );
}

export function CampaignLaunchPrepCard({
  action,
}: AgentCardProps): ReactElement {
  const data = action.data ?? {};

  return (
    <div className="my-2 rounded-lg border border-amber-500/20 bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <HiRocketLaunch className="h-5 w-5 text-amber-500" />
        <h3 className="text-sm font-semibold text-foreground">
          {action.title || 'Campaign launch prep'}
        </h3>
      </div>
      {action.description ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {action.description}
        </p>
      ) : null}
      <div className="space-y-2 rounded border border-border bg-card/40 p-3 text-xs text-muted-foreground">
        {typeof data.platform === 'string' ? (
          <div>Platform: {data.platform}</div>
        ) : null}
        {typeof data.channel === 'string' ? (
          <div>Channel: {data.channel}</div>
        ) : null}
        <div>Review required before any publish action.</div>
      </div>
      <CardCtas action={action} />
    </div>
  );
}
