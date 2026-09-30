'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { StoryboardRuntimeRailProps } from '@genfeedai/props/studio/storyboard.props';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';

export default function StoryboardRuntimeRail({
  budgetSeconds,
  shots,
  selectedShotId,
  onSelectShot,
}: StoryboardRuntimeRailProps) {
  const translate = useTranslations('pages.studioStoryboard.runtime');
  const used = shots.reduce(
    (total, shot) => total + (shot.durationSeconds ?? 0),
    0,
  );
  return (
    <section aria-label={translate('ariaLabel')} className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>
          {budgetSeconds === null
            ? translate('usedWithoutBudget', { used })
            : translate('usedWithBudget', { used, budget: budgetSeconds })}
        </span>
        <span className="text-muted-foreground">
          {translate('shotCount', { count: shots.length })}
        </span>
      </div>
      {budgetSeconds !== null && used > budgetSeconds ? (
        <p role="alert" className="text-xs text-destructive">
          {translate('overBudget')}
        </p>
      ) : null}
      {shots.length ? (
        <div
          className="flex min-h-10 gap-1 overflow-x-auto"
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
              style={{ flexGrow: shot.durationSeconds ?? 0, flexBasis: 0 }}
              className={cn(
                'flex min-w-16 flex-col items-center justify-center rounded-md border border-border px-2 py-1 text-xs hover:bg-hover',
                selectedShotId === shot.id && 'border-border-strong bg-hover',
              )}
            >
              <span>{translate('shot', { ordinal: shot.ordinal })}</span>
              <span className="text-muted-foreground">
                {shot.durationSeconds === null
                  ? translate('unset')
                  : translate('seconds', { seconds: shot.durationSeconds })}
              </span>
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{translate('empty')}</p>
      )}
    </section>
  );
}
