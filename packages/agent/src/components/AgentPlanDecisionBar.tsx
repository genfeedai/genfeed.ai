import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { ListChecks } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

interface AgentPlanDecisionBarProps {
  isBusy: boolean;
  /** The prompt bar holds no text, so there is nothing to send as feedback. */
  isDraftEmpty: boolean;
  onApprove: () => void | Promise<void>;
  /** Sends the prompt bar's text as the requested changes. */
  onRequestChanges: () => void;
}

/**
 * The decision on a proposed plan, shown above the prompt bar. Feedback is
 * typed in the prompt bar itself; Request changes sends it.
 */
export function AgentPlanDecisionBar({
  isBusy,
  isDraftEmpty,
  onApprove,
  onRequestChanges,
}: AgentPlanDecisionBarProps): ReactElement {
  const translate = useTranslations('agent.plan');

  return (
    <div
      aria-label={translate('decisionLabel')}
      className="flex min-w-0 items-center gap-2 rounded-lg border bg-card/95 px-2.5 py-1.5 shadow-sm backdrop-blur-sm"
      data-testid="agent-plan-decision"
      role="group"
    >
      <ListChecks
        aria-hidden
        className="size-3.5 shrink-0 text-foreground/55"
      />
      <span className="min-w-0 flex-1 truncate text-xs text-foreground/82">
        {translate('decisionPrompt')}
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          isDisabled={isBusy || isDraftEmpty}
          label={translate('requestChanges')}
          onClick={onRequestChanges}
          size={ButtonSize.SM}
          tooltip={isDraftEmpty ? translate('requestChangesHint') : undefined}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        />
        <Button
          isDisabled={isBusy}
          label={translate('approve')}
          onClick={() => {
            void onApprove();
          }}
          size={ButtonSize.SM}
          variant={ButtonVariant.DEFAULT}
          withWrapper={false}
        />
      </div>
    </div>
  );
}
