import type { AgentProposedPlan } from '@cloud/agent/models/agent-chat.model';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import Button from '@ui/buttons/base/Button';
import { type ReactElement, type ReactNode, useMemo, useState } from 'react';

interface AgentPlanReviewCardProps {
  extraActions?: ReactNode;
  footerMessage?: string | null;
  isBusy?: boolean;
  onApprove: () => void | Promise<void>;
  onRequestChanges: (revisionNote: string) => void | Promise<void>;
  plan: AgentProposedPlan;
}

function formatStatusLabel(status?: AgentProposedPlan['status']): string {
  switch (status) {
    case 'approved':
      return 'Approved';
    case 'superseded':
      return 'Superseded';
    case 'draft':
      return 'Draft';
    case 'awaiting_approval':
    default:
      return 'Awaiting approval';
  }
}

export function AgentPlanReviewCard({
  extraActions,
  footerMessage = null,
  isBusy = false,
  onApprove,
  onRequestChanges,
  plan,
}: AgentPlanReviewCardProps): ReactElement {
  const [revisionNote, setRevisionNote] = useState(plan.revisionNote ?? '');
  const statusLabel = formatStatusLabel(plan.status);
  const steps = useMemo(
    () =>
      (plan.steps ?? []).flatMap((step, index) => {
        const label = typeof step.step === 'string' ? step.step : null;
        if (!label) {
          return [];
        }

        const status =
          typeof step.status === 'string' ? ` (${step.status})` : '';

        return [`${index + 1}. ${label}${status}`];
      }),
    [plan.steps],
  );
  const canApprove = !isBusy && plan.status !== 'approved';
  const canRequestChanges = !isBusy;

  return (
    <div
      className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5 shadow-[0_18px_45px_rgba(0,0,0,0.22)]"
      data-testid="agent-plan-review-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-foreground/45">
            Proposed plan
          </p>
          <p className="mt-1 text-sm text-foreground/70">{statusLabel}</p>
        </div>
        <div
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-medium',
            plan.status === 'approved'
              ? 'border-emerald-500/30 bg-emerald-500/12 text-emerald-300'
              : 'border-amber-500/30 bg-amber-500/12 text-amber-200',
          )}
        >
          {statusLabel}
        </div>
      </div>

      {plan.explanation ? (
        <p className="mt-4 text-sm leading-6 text-foreground/80">
          {plan.explanation}
        </p>
      ) : null}

      {plan.content ? (
        <div className="mt-4 rounded-2xl border border-white/[0.06] bg-black/20 p-4">
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/85">
            {plan.content}
          </p>
        </div>
      ) : null}

      {steps.length > 0 ? (
        <div className="mt-4 space-y-2">
          {steps.map((step) => (
            <p key={step} className="text-sm leading-6 text-foreground/72">
              {step}
            </p>
          ))}
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        <textarea
          value={revisionNote}
          onChange={(event) => setRevisionNote(event.target.value)}
          disabled={isBusy}
          placeholder="Add feedback if you want the plan revised"
          className="min-h-24 w-full rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-foreground/35 focus:border-primary/35"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant={ButtonVariant.DEFAULT}
            withWrapper={false}
            onClick={() => {
              void onApprove();
            }}
            isDisabled={!canApprove}
            className="rounded-xl px-4 py-2 text-sm"
          >
            Approve
          </Button>
          <Button
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
            onClick={() => {
              void onRequestChanges(revisionNote.trim());
            }}
            isDisabled={!canRequestChanges}
            className="rounded-xl px-4 py-2 text-sm"
          >
            Request changes
          </Button>
          {extraActions}
        </div>
        {footerMessage ? (
          <p className="text-sm text-foreground/60">{footerMessage}</p>
        ) : null}
      </div>
    </div>
  );
}
