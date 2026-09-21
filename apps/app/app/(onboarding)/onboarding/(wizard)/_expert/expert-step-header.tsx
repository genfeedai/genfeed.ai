'use client';

import { useOnboarding } from '@contexts/onboarding/onboarding-context';
import type { ExpertStepHeaderProps } from '@props/onboarding/expert-path.props';
import { GraduationCap } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function ExpertStepHeader({
  description,
  title,
}: ExpertStepHeaderProps) {
  const translate = useTranslations('pages.onboarding.expert.common');
  const { currentStepIndex, steps } = useOnboarding();

  return (
    <div className="max-w-2xl space-y-4">
      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background-tertiary px-4 py-1.5 text-2xs font-black uppercase tracking-[0.2em] text-muted-foreground">
        <GraduationCap className="size-3" />
        {translate('badge', {
          current: currentStepIndex + 1,
          total: steps.length,
        })}
      </div>
      <h1 className="text-4xl font-semibold leading-none tracking-tight text-foreground text-balance md:text-5xl">
        {title}
      </h1>
      <p className="text-lg text-muted-foreground">{description}</p>
    </div>
  );
}
