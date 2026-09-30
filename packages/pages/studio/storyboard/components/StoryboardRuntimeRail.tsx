'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { StoryboardRuntimeRailProps } from '@genfeedai/props/studio/storyboard.props';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';

export default function StoryboardRuntimeRail({
  budgetSeconds,
  shots,
  selectedShotId,
  onSelectShot,
}: StoryboardRuntimeRailProps) {
  const used = shots.reduce(
    (total, shot) => total + (shot.durationSeconds ?? 0),
    0,
  );
  return (
    <section aria-label="Storyboard runtime" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>
          {used}s /{' '}
          {budgetSeconds === null ? 'Choose runtime' : `${budgetSeconds}s`}
        </span>
        <span className="text-muted-foreground">{shots.length} shots</span>
      </div>
      {budgetSeconds !== null && used > budgetSeconds ? (
        <p role="alert" className="text-xs text-destructive">
          Shorten another shot to fit the runtime budget.
        </p>
      ) : null}
      {shots.length ? (
        <div
          className="flex min-h-10 gap-1 overflow-x-auto"
          role="group"
          aria-label="Shot timeline"
        >
          {shots.map((shot) => (
            <Button
              key={shot.id}
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              ariaLabel={`Shot ${shot.ordinal}, ${shot.durationSeconds === null ? 'duration not set' : `${shot.durationSeconds} seconds`}`}
              aria-pressed={selectedShotId === shot.id}
              onClick={() => onSelectShot(shot.id)}
              style={{ flexGrow: shot.durationSeconds ?? 0, flexBasis: 0 }}
              className={cn(
                'flex min-w-16 flex-col items-center justify-center rounded-md border border-border px-2 py-1 text-xs hover:bg-hover',
                selectedShotId === shot.id && 'border-border-strong bg-hover',
              )}
            >
              <span>Shot {shot.ordinal}</span>
              <span className="text-muted-foreground">
                {shot.durationSeconds === null
                  ? 'Unset'
                  : `${shot.durationSeconds}s`}
              </span>
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No shots yet</p>
      )}
    </section>
  );
}
