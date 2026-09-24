import type { BrandStepHeaderProps } from '@props/onboarding/brand-form-fields.props';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

export default function BrandStepHeader({ step }: BrandStepHeaderProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current !== step) {
      headingRef.current?.focus();
      previousStep.current = step;
    }
  }, [step]);
  const translate = useTranslations('pages.onboarding.brand');
  return (
    <>
      <div className="step-badge inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-background-tertiary border border-border text-muted-foreground text-2xs font-black uppercase tracking-[0.2em] mb-6">
        <Sparkles className="size-3" />
        {translate('steps.progress', { current: step, total: 3 })}
      </div>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="step-headline mb-4 text-4xl font-semibold leading-none tracking-tight text-foreground md:text-5xl text-balance"
      >
        {translate(`steps.${step}.title`)}
      </h1>
      <p className="step-description text-lg text-muted-foreground mb-8 max-w-lg">
        {translate(`steps.${step}.description`)}
      </p>
    </>
  );
}
