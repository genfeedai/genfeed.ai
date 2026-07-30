'use client';

export function GenerateEmptyState() {
  return (
    <div className="flex flex-col items-center text-center">
      <h2 className="mb-2 text-center text-2xl font-semibold tracking-[-0.03em] text-foreground md:text-[1.75rem]">
        Start with a prompt
      </h2>
      <p className="max-w-2xl text-center text-sm leading-5 text-foreground/48">
        Describe the first asset, then refine it in Studio.
      </p>
    </div>
  );
}
