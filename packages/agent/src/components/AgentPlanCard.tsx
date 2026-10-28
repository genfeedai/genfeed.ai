import { SafeMarkdown } from '@genfeedai/agent/components/SafeMarkdown';
import { AGENT_ASSISTANT_PROSE_CLASS } from '@genfeedai/agent/constants/conversation-layout.constant';
import type { AgentProposedPlan } from '@genfeedai/agent/models/agent-chat.model';
import {
  getProposedPlanSteps,
  hasProposedPlanBody,
} from '@genfeedai/agent/utils/proposed-plan.util';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Badge } from '@ui/primitives/badge';
import { useTranslations } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';

interface AgentPlanCardProps {
  /** Right-aligned actions under the plan, e.g. creating follow-up tasks. */
  actions?: ReactNode;
  footerMessage?: string | null;
  plan: AgentProposedPlan;
}

function getStatusBadgeVariant(
  status: AgentProposedPlan['status'],
): 'secondary' | 'success' | 'warning' {
  switch (status) {
    case 'approved':
      return 'success';
    case 'draft':
    case 'superseded':
      return 'secondary';
    default:
      return 'warning';
  }
}

/**
 * A plan the agent proposed, read in the conversation where it was proposed.
 * The decision on it lives in the prompt bar, not here.
 */
export function AgentPlanCard({
  actions,
  footerMessage = null,
  plan,
}: AgentPlanCardProps): ReactElement {
  const translate = useTranslations('agent.plan');
  const steps = getProposedPlanSteps(plan);
  const content = plan.content?.trim() ?? '';
  const explanation = plan.explanation?.trim() ?? '';
  const status = plan.status ?? 'awaiting_approval';
  const statusLabels = {
    approved: translate('statusApproved'),
    awaiting_approval: translate('statusAwaitingApproval'),
    draft: translate('statusDraft'),
    superseded: translate('statusSuperseded'),
  } as const;

  return (
    <section
      aria-label={translate('title')}
      className="my-3 min-w-0 rounded-lg border border-border bg-card p-4"
      data-testid="agent-plan-card"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">
          {translate('title')}
        </h3>
        <Badge variant={getStatusBadgeVariant(status)}>
          {statusLabels[status]}
        </Badge>
      </div>

      {explanation ? (
        <p className="mt-3 text-sm leading-6 text-foreground/80">
          {explanation}
        </p>
      ) : null}

      {content ? (
        <SafeMarkdown
          className={cn(
            'mt-3 min-w-0 max-w-full break-words [overflow-wrap:anywhere]',
            AGENT_ASSISTANT_PROSE_CLASS,
          )}
          content={content}
        />
      ) : steps.length > 0 ? (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-6 text-foreground/80">
          {steps.map((step) => (
            <li key={step.id}>{step.label}</li>
          ))}
        </ol>
      ) : null}

      {!hasProposedPlanBody(plan) ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {translate('empty')}
        </p>
      ) : null}

      {actions ? <div className="mt-3 flex justify-end">{actions}</div> : null}
      {footerMessage ? (
        <p className="mt-2 text-right text-xs text-muted-foreground">
          {footerMessage}
        </p>
      ) : null}
    </section>
  );
}
