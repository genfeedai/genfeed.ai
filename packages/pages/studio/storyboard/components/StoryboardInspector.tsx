'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { StoryboardInspectorProps } from '@genfeedai/props/studio/storyboard.props';
import { cn } from '@helpers/formatting/cn/cn.util';
import Tabs from '@ui/navigation/tabs/Tabs';
import { Button } from '@ui/primitives/button';
import { ImagePlus, LoaderCircle, TriangleAlert } from 'lucide-react';
import NextImage from 'next/image';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type InspectorTab = 'shots' | 'details' | 'references' | 'cast';

/** Body of the shell's context sidebar for a storyboard run. */
export default function StoryboardInspector({
  cast,
  castCount,
  details,
  isStillActionDisabled = false,
  missingStillCount = 0,
  onGenerateMissingStills,
  onSelectShot,
  references,
  referenceCount,
  selectedShotId,
  shots,
  totalSeconds,
}: StoryboardInspectorProps) {
  const translate = useTranslations('pages.studioStoryboard.inspector');
  const translateWorkspace = useTranslations(
    'pages.studioStoryboard.workspace',
  );
  const [tab, setTab] = useState<InspectorTab>('shots');
  return (
    <div className="flex flex-col gap-4 p-4" data-testid="storyboard-inspector">
      <Tabs
        ariaLabel={translate('tabs')}
        items={[
          {
            id: 'shots',
            label: translateWorkspace('shots'),
            badge: <span className="tabular-nums">{shots.length}</span>,
          },
          { id: 'details', label: translate('details') },
          {
            id: 'references',
            label: translate('references'),
            badge: <span className="tabular-nums">{referenceCount}</span>,
          },
          {
            id: 'cast',
            label: translate('cast'),
            badge: <span className="tabular-nums">{castCount}</span>,
          },
        ]}
        activeTab={tab}
        onTabChange={(next) => setTab(next as InspectorTab)}
        fullWidth={false}
        className="justify-start"
        listClassName="ml-0"
      />
      {tab === 'shots' ? (
        shots.length ? (
          <div className="flex flex-col gap-1">
            <p className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{translate('shotList')}</span>
              <span className="tabular-nums">
                {translateWorkspace('seconds', { seconds: totalSeconds })}
              </span>
            </p>
            {shots.map((shot) => (
              <Button
                key={shot.id}
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                ariaLabel={translate('jumpToShot', {
                  ordinal: shot.ordinal,
                  name: shot.name,
                })}
                aria-pressed={selectedShotId === shot.id}
                onClick={() => onSelectShot(shot.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md p-1.5 text-left hover:bg-hover',
                  selectedShotId === shot.id && 'bg-hover',
                )}
              >
                <span className="relative block h-10 w-6 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
                  {shot.stillUrl ? (
                    <NextImage
                      src={shot.stillUrl}
                      alt=""
                      fill
                      unoptimized
                      sizes="24px"
                      className="object-cover"
                    />
                  ) : null}
                </span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {String(shot.ordinal).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {shot.name}
                </span>
                {shot.stillFreshness === 'generating' ? (
                  <LoaderCircle
                    className="size-3.5 shrink-0 animate-spin text-muted-foreground"
                    aria-label={translate('stillGenerating')}
                  />
                ) : shot.isStillFresh ? null : (
                  <TriangleAlert
                    className="size-3.5 shrink-0 text-warning"
                    aria-label={translate('stillOutOfDate')}
                  />
                )}
                <span className="text-xs tabular-nums text-muted-foreground">
                  {shot.durationSeconds === null
                    ? translate('durationUnset')
                    : translateWorkspace('seconds', {
                        seconds: shot.durationSeconds,
                      })}
                </span>
              </Button>
            ))}
            {onGenerateMissingStills && missingStillCount > 0 ? (
              <Button
                className="mt-2 self-start"
                icon={<ImagePlus className="size-4" />}
                isDisabled={isStillActionDisabled}
                label={translate('generateMissingStills', {
                  count: missingStillCount,
                })}
                onClick={onGenerateMissingStills}
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              />
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {translate('noShots')}
          </p>
        )
      ) : null}
      {tab === 'details' ? details : null}
      {tab === 'references' ? references : null}
      {tab === 'cast' ? cast : null}
    </div>
  );
}
