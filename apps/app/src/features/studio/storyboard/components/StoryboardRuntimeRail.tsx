'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { StoryboardRuntimeRailProps } from '@genfeedai/props/studio/storyboard.props';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';

/** One-line runtime meter for the sub-topbar: seconds used, a shot-by-shot bar, shot count. */
export default function StoryboardRuntimeRail({
  budgetSeconds,
  formatLabel,
  shots,
  selectedShotId,
  onSelectShot,
}: StoryboardRuntimeRailProps) {
  const translate = useTranslations('pages.studioStoryboard.runtime');
  const used = shots.reduce(
    (total, shot) => total + (shot.durationSeconds ?? 0),
    0,
  );
  const isOverBudget = budgetSeconds !== null && used > budgetSeconds;
  const remaining = budgetSeconds === null ? 0 : budgetSeconds - used;
  const shotCountLabel = translate('shotCount', { count: shots.length });
  return (
    <section
      aria-label={translate('ariaLabel')}
      className="flex min-w-0 items-center gap-3 text-xs"
    >
      <span
        className={cn(
          'whitespace-nowrap font-medium tabular-nums',
          isOverBudget && 'text-destructive',
        )}
      >
        {budgetSeconds === null
          ? translate('usedWithoutBudget', { used })
          : translate('usedWithBudget', { used, budget: budgetSeconds })}
      </span>
      {shots.length ? (
        <div
          className="hidden h-1.5 w-32 gap-0.5 sm:flex"
          role="group"
          aria-label={translate('timeline')}
        >
          {shots.map((shot) => (
            <Button
              key={shot.id}
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              ariaLabel={translate('shotAria', {
                ordinal: shot.ordinal,
                duration:
                  shot.durationSeconds === null
                    ? translate('durationUnset')
                    : translate('durationSeconds', {
                        seconds: shot.durationSeconds,
                      }),
              })}
              aria-pressed={selectedShotId === shot.id}
              onClick={() => onSelectShot(shot.id)}
              style={{ flexGrow: shot.durationSeconds ?? 1, flexBasis: 0 }}
              className={cn(
                'h-full min-w-1 rounded-sm bg-foreground/40 hover:bg-foreground/60',
                selectedShotId === shot.id && 'bg-foreground',
                isOverBudget && 'bg-destructive/70',
              )}
            />
          ))}
          {remaining > 0 ? (
            <span
              aria-hidden
              className="h-full rounded-sm bg-border"
              style={{ flexGrow: remaining, flexBasis: 0 }}
            />
          ) : null}
        </div>
      ) : null}
      <span className="hidden whitespace-nowrap text-muted-foreground md:inline">
        {formatLabel ? `${shotCountLabel} · ${formatLabel}` : shotCountLabel}
      </span>
      {isOverBudget ? (
        <p role="alert" className="sr-only">
          {translate('overBudget')}
        </p>
      ) : null}
    </section>
  );
}
