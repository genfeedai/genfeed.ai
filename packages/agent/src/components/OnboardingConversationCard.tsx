'use client';

import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

/**
 * Hint above the onboarding composer. The prompt bar is the only input —
 * paste a site or type what you make there, then send.
 */
export function OnboardingConversationCard(): ReactElement {
  const translate = useTranslations('common.agent.onboardingComposerCard');

  return (
    <div
      className="rounded-lg border border-border/70 bg-background-secondary/90 px-3 py-2.5"
      data-testid="onboarding-composer-card"
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-foreground/[0.06] ring-1 ring-inset ring-foreground/[0.08]">
          <Sparkles className="size-3.5 text-foreground/70" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">
            {translate('title')}
          </h3>
          <p className="mt-0.5 text-xs leading-5 text-foreground/55">
            {translate('description')}
          </p>
        </div>
      </div>
    </div>
  );
}
