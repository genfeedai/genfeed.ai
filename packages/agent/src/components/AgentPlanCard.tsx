import { SafeMarkdown } from '@genfeedai/agent/components/SafeMarkdown';
import { AGENT_ASSISTANT_PROSE_CLASS } from '@genfeedai/agent/constants/conversation-layout.constant';
import type { AgentProposedPlan } from '@genfeedai/agent/models/agent-chat.model';
import {
  getProposedPlanSteps,
  hasProposedPlanBody,
} from '@genfeedai/agent/utils/proposed-plan.util';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';
import { type ReactElement, type ReactNode, useState } from 'react';

export interface AgentPlanDecision {
  /** A decision is being sent; both actions lock. */
  isBusy: boolean;
  onApprove: () => void | Promise<void>;
  onRequestChanges: (revisionNote: string) => void | Promise<void>;
}

interface AgentPlanCardProps {
  /** Right-aligned actions under the plan, e.g. creating follow-up tasks. */
  actions?: ReactNode;
  /** Approve or revise the plan; only shown while it awaits approval. */
  decision?: AgentPlanDecision;
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
 * A plan the agent proposed, read and decided in the conversation where it
 * was proposed. Request changes opens a note field in the card itself.
 */
export function AgentPlanCard({
  actions,
  decision,
  footerMessage = null,
  plan,
}: AgentPlanCardProps): ReactElement {
  const translate = useTranslations('agent.plan');
  const [isRevising, setIsRevising] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');
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
  const isDecisionOpen =
    Boolean(decision) &&
    status === 'awaiting_approval' &&
    hasProposedPlanBody(plan);
  const trimmedNote = revisionNote.trim();

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

      {decision && isDecisionOpen ? (
        <div
          aria-label={translate('decisionLabel')}
          className="mt-3 flex flex-col gap-2"
          data-testid="agent-plan-decision"
          role="group"
        >
          {isRevising ? (
            <Textarea
              aria-label={translate('revisePlaceholder')}
              isDisabled={decision.isBusy}
              onChange={(event) => setRevisionNote(event.target.value)}
              placeholder={translate('revisePlaceholder')}
              rows={3}
              value={revisionNote}
            />
          ) : null}
          <div className="flex justify-end gap-2">
            {isRevising ? (
              <>
                <Button
                  isDisabled={decision.isBusy}
                  label={translate('cancel')}
                  onClick={() => {
                    setIsRevising(false);
                    setRevisionNote('');
                  }}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
                  withWrapper={false}
                />
                <Button
                  isDisabled={decision.isBusy || !trimmedNote}
                  label={translate('sendChanges')}
                  onClick={() => {
                    void Promise.resolve(
                      decision.onRequestChanges(trimmedNote),
                    ).then(() => {
                      setIsRevising(false);
                      setRevisionNote('');
                    });
                  }}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.DEFAULT}
                  withWrapper={false}
                />
              </>
            ) : (
              <>
                <Button
                  isDisabled={decision.isBusy}
                  label={translate('requestChanges')}
                  onClick={() => setIsRevising(true)}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                  withWrapper={false}
                />
                <Button
                  isDisabled={decision.isBusy}
                  label={translate('approve')}
                  onClick={() => {
                    void decision.onApprove();
                  }}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.DEFAULT}
                  withWrapper={false}
                />
              </>
            )}
          </div>
        </div>
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
