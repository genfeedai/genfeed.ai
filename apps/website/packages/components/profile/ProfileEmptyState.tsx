interface ProfileEmptyStateProps {
  handle: string;
}

export default function ProfileEmptyState({ handle }: ProfileEmptyStateProps) {
  return (
    <section
      aria-label="Empty profile"
      className="rounded-2xl border border-foreground/[0.08] bg-foreground/5 px-6 py-10 text-center"
    >
      <h2 className="text-foreground font-semibold">Nothing here yet</h2>
      <p className="mt-2 text-sm text-foreground/60">
        @{handle} has not shared any content, links or socials yet. Check back
        soon.
      </p>
    </section>
  );
}
