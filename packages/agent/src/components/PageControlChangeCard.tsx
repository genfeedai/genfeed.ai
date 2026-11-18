import type { AgentUiActionOf } from '@genfeedai/agent/models/agent-chat.model';
import {
  applyPageControlChanges,
  type PageControlChangeOutcome,
} from '@genfeedai/agent/utils/page-controls.bridge';
import { ButtonVariant } from '@genfeedai/contracts';
import type { AgentPageControlChangeStep } from '@genfeedai/contracts/interfaces';
import { Alert } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactElement, useState } from 'react';

interface PageControlChangeCardProps {
  action: AgentUiActionOf<'page_control_change_card'>;
  /** Archived or busy threads keep the card visible but cannot apply it. */
  isInert?: boolean;
}

type Translate = ReturnType<
  typeof useTranslations<'agent.pageControlChangeCard'>
>;

function describeStep(
  step: AgentPageControlChangeStep,
  translate: Translate,
): string {
  if (step.action === 'setChecked') {
    return translate(step.value === true ? 'turnOn' : 'turnOff', {
      label: step.label,
    });
  }
  return translate('setValue', {
    label: step.label,
    value: String(step.value),
  });
}

function describeOutcome(
  outcome: PageControlChangeOutcome,
  translate: Translate,
): string {
  if (outcome.status === 'applied') {
    return translate('applied');
  }
  if (outcome.status === 'unchanged') {
    return translate('unchanged');
  }
  return translate(`refused.${outcome.reason}`, {
    detail: outcome.detail ?? '',
  });
}

export function PageControlChangeCard({
  action,
  isInert = false,
}: PageControlChangeCardProps): ReactElement {
  const translate = useTranslations('agent.pageControlChangeCard');
  const [isApplying, setIsApplying] = useState(false);
  const [outcomes, setOutcomes] = useState<PageControlChangeOutcome[] | null>(
    null,
  );
  const isSettled =
    outcomes?.every((outcome) => outcome.status !== 'refused') === true;

  async function handleApply(): Promise<void> {
    setIsApplying(true);
    try {
      setOutcomes(await applyPageControlChanges(action.steps));
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <div className="my-2 border border-border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <SlidersHorizontal className="size-5 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{action.title}</h3>
      </div>

      {action.description ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {action.description}
        </p>
      ) : null}

      <ul className="mb-3 flex flex-col gap-2">
        {action.steps.map((step, index) => {
          const outcome = outcomes?.[index];
          return (
            <li
              className="flex flex-col gap-0.5 text-sm"
              key={`${step.label}-${step.action}`}
            >
              <span className="text-foreground">
                {describeStep(step, translate)}
              </span>
              {outcome ? (
                <span
                  className={
                    outcome.status === 'refused'
                      ? 'text-xs text-destructive'
                      : 'text-xs text-muted-foreground'
                  }
                >
                  {describeOutcome(outcome, translate)}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {isSettled ? (
        <Alert variant="success">{translate('done')}</Alert>
      ) : (
        <Button
          className="w-full"
          isDisabled={isInert || isApplying}
          onClick={handleApply}
          variant={ButtonVariant.DEFAULT}
          withWrapper={false}
        >
          {outcomes ? translate('retry') : translate('apply')}
        </Button>
      )}
    </div>
  );
}
