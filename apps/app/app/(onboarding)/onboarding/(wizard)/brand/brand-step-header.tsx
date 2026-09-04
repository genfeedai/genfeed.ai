'use client';

import { Sparkles } from 'lucide-react';

export default function BrandStepHeader() {
  return (
    <>
      <div className="step-badge inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-background-tertiary border border-border text-muted-foreground text-2xs font-black uppercase tracking-[0.2em] mb-8">
        <Sparkles className="size-3" />
        Step 1 of 3
      </div>

      <h1 className="step-headline mb-4 text-4xl font-semibold leading-none tracking-tight text-foreground md:text-5xl text-balance">
        Set up your brand.
      </h1>

      <p className="step-description text-lg text-muted-foreground mb-8 max-w-lg">
        Confirm your workspace details so we can personalize your first content
        setup.
      </p>
    </>
  );
}
