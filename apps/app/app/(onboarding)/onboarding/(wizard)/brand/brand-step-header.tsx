'use client';

import { HiSparkles } from 'react-icons/hi2';

export default function BrandStepHeader() {
  return (
    <>
      <div className="step-badge opacity-0 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-[0.2em] mb-8">
        <HiSparkles className="size-3" />
        Step 1 of 3
      </div>

      <h1 className="step-headline opacity-0 text-4xl md:text-5xl font-serif leading-none tracking-tighter text-white mb-4">
        Set up your <span className="font-light italic">brand.</span>
      </h1>

      <p className="step-description opacity-0 text-lg text-white/40 mb-8 max-w-lg">
        Confirm your workspace details so we can personalize your first content
        setup.
      </p>
    </>
  );
}
