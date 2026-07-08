'use client';

import { HiOutlineSparkles } from 'react-icons/hi2';

export function GenerateEmptyState() {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-3 flex size-9 items-center justify-center rounded-md bg-foreground/[0.05] ring-1 ring-inset ring-foreground/[0.08]">
        <HiOutlineSparkles className="size-4 text-foreground/68" />
      </div>

      <h2 className="mb-1 text-center text-base font-semibold tracking-[-0.02em] text-foreground">
        Start with a prompt
      </h2>
      <p className="max-w-md text-center text-xs leading-5 text-foreground/52">
        Describe the first asset, then refine it in Studio.
      </p>
    </div>
  );
}
