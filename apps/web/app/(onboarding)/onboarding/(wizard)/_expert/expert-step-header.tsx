'use client';

import { useOnboarding } from '@contexts/onboarding/onboarding-context';
import { Badge } from '@ui/primitives/badge';
import { GraduationCap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ExpertStepHeaderProps } from '@/features/onboarding/props/expert-path.props';

export default function ExpertStepHeader({
  description,
  isFinalStep = false,
  title,
}: ExpertStepHeaderProps) {
  const translate = useTranslations('pages.onboarding.expert.common');
  const { currentStepIndex, steps } = useOnboarding();

  // `first-system` is not a gate step, so it never appears in `steps`; the
  // Expert Path still ends there, which is what the badge has to count.
  const total = steps.length + 1;
  const current = isFinalStep ? total : currentStepIndex + 1;

  return (
    <div className="max-w-2xl space-y-4">
      <Badge icon={<GraduationCap />} shape="pill" size="xl" variant="outline">
        {translate('badge', { current, total })}
      </Badge>
      <h1 className="text-4xl font-semibold leading-none tracking-tight text-foreground text-balance md:text-5xl">
        {title}
      </h1>
      <p className="text-lg text-muted-foreground">{description}</p>
    </div>
  );
}
