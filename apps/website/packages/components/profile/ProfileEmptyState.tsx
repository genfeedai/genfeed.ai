interface ProfileEmptyStateProps {
  handle: string;
}

export default function ProfileEmptyState({ handle }: ProfileEmptyStateProps) {
  return (
    <section
      aria-label="Empty profile"
      className="rounded-2xl border border-edge/[0.08] bg-fill/5 px-6 py-10 text-center"
    >
      <h2 className="text-surface font-semibold">Nothing here yet</h2>
      <p className="mt-2 text-sm text-surface/60">
        @{handle} has not shared any content, links or socials yet. Check back
        soon.
      </p>
    </section>
  );
}
