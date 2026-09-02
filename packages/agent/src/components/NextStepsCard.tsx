import { AGENT_CONVERSATION_SURFACE_CLASS } from '@genfeedai/agent/constants/conversation-layout.constant';
import type {
  AgentUiAction,
  AgentUiActionCta,
  AgentUiActionHandler,
} from '@genfeedai/agent/models/agent-chat.model';
import { normalizeAgentAppHref } from '@genfeedai/agent/utils/normalize-agent-app-href';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactElement } from 'react';

interface NextStepsCardProps {
  action: AgentUiAction;
  onUiAction?: AgentUiActionHandler;
}

function NextStepCtaButton({
  cta,
  isPrimary,
  onUiAction,
}: {
  cta: AgentUiActionCta;
  isPrimary: boolean;
  onUiAction?: AgentUiActionHandler;
}): ReactElement {
  // Navigation goes through Link inside Button so client-side routing is
  // preserved and global `a { color }` rules cannot paint unreadable text on
  // card chrome.
  const className = 'h-7 px-2.5 text-xs font-medium';
  const variant = isPrimary ? ButtonVariant.SECONDARY : ButtonVariant.GHOST;

  if (cta.href) {
    const href = normalizeAgentAppHref(cta.href) ?? cta.href;

    return (
      <Button
        asChild
        className={className}
        size={ButtonSize.SM}
        variant={variant}
        withWrapper={false}
      >
        <Link href={href}>
          {cta.label}
          <ArrowUpRight className="ml-1 size-3.5" />
        </Link>
      </Button>
    );
  }

  return (
    <Button
      className={className}
      size={ButtonSize.SM}
      variant={variant}
      withWrapper={false}
      onClick={() => {
        if (!cta.action) {
          return;
        }
        void onUiAction?.(cta.action, cta.payload);
      }}
    >
      {cta.label}
    </Button>
  );
}

/**
 * The clickable form of "here is what you can do next". Every option renders
 * its own controls — the page that owns it, an in-conversation follow-up, or
 * both — so an offered choice is never prose the user has to retype.
 */
export function NextStepsCard({
  action,
  onUiAction,
}: NextStepsCardProps): ReactElement | null {
  const steps = action.nextSteps ?? [];

  if (steps.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        AGENT_CONVERSATION_SURFACE_CLASS,
        'mt-1.5 w-full min-w-0 max-w-full overflow-hidden text-left',
      )}
      data-testid="agent-next-steps-card"
    >
      <div className="px-3 py-2">
        <p className="text-sm font-medium text-foreground/90">
          {action.title || 'What would you like to do?'}
        </p>
        {action.description ? (
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {action.description}
          </p>
        ) : null}
      </div>

      <ul className="divide-y divide-border/50 border-t border-border/50">
        {steps.map((step) => (
          <li
            key={step.id}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2"
          >
            <div className="min-w-0 flex-1 basis-48">
              <p className="text-sm font-medium text-foreground/90">
                {step.title}
              </p>
              {step.description ? (
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  {step.description}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap gap-1.5">
              {step.ctas.map((cta, index) => (
                <NextStepCtaButton
                  key={`${step.id}-cta-${cta.label}-${index}`}
                  cta={cta}
                  isPrimary={index === 0}
                  onUiAction={onUiAction}
                />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
