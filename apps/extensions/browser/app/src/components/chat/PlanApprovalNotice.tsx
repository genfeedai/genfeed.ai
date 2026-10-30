import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';

import type { ChatMessage } from '~models/chat.model';
import { appDomain } from '~services/environment.service';

interface PlanApprovalNoticeProps {
  message: ChatMessage;
}

/** True when the agent stopped to wait for an approval the panel cannot give. */
export function isAwaitingApproval(message: ChatMessage): boolean {
  return Boolean(
    message.metadata?.reviewRequired || message.metadata?.proposedPlan,
  );
}

/**
 * A paused run must never look like an answer. The panel cannot approve a
 * plan, so it shows what the agent proposed and sends the user to Genfeed.
 */
export function PlanApprovalNotice({
  message,
}: PlanApprovalNoticeProps): ReactElement {
  const plan = message.metadata?.proposedPlan;
  const steps = plan?.steps?.filter((step) => step.step) ?? [];

  return (
    <div className="flex flex-col gap-2" role="alert">
      <p className="text-xs font-medium">Waiting for your approval</p>
      <p className="whitespace-pre-wrap break-words">{message.content}</p>
      {plan?.content ? (
        <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
          {plan.content}
        </p>
      ) : null}
      {steps.length > 0 ? (
        <ol className="list-decimal pl-4 text-xs text-muted-foreground">
          {steps.map((step) => (
            <li key={step.step}>{step.step}</li>
          ))}
        </ol>
      ) : null}
      <p className="text-xs text-muted-foreground">
        This panel can't approve a plan. Open Genfeed to review it.
      </p>
      <Button
        className="self-start"
        size={ButtonSize.SM}
        variant={ButtonVariant.SECONDARY}
        onClick={() => {
          void chrome.tabs.create({ url: appDomain });
        }}
      >
        Open Genfeed
      </Button>
    </div>
  );
}
