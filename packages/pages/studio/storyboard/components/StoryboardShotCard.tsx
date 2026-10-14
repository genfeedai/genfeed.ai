'use client';

import { AgentMediaArtifactPreview } from '@genfeedai/agent/components/AgentMediaArtifactPreview';
import { ButtonSize, ButtonVariant, CardVariant } from '@genfeedai/contracts';
import type { StoryboardShotCardProps } from '@genfeedai/props/studio/storyboard.props';
import { cn } from '@helpers/formatting/cn/cn.util';
import StoryboardCharacterReplace from '@pages/studio/storyboard/components/StoryboardCharacterReplace';
import StoryboardSelect from '@pages/studio/storyboard/components/StoryboardSelect';
import {
  formatStoryboardTimecode,
  storyboardDurationStep,
} from '@pages/studio/storyboard/utils/storyboard-runtime';
import Card from '@ui/card/Card';
import GenerationStatus from '@ui/feedback/generation-status/GenerationStatus';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { EditableText } from '@ui/primitives/editable-text';
import Field from '@ui/primitives/field';
import { Slider } from '@ui/primitives/slider';
import { Textarea } from '@ui/primitives/textarea';
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  CircleCheck,
  ImagePlus,
  MoreHorizontal,
  Trash2,
  UserRoundCog,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const STILL_ASPECT_CLASSES = {
  '1:1': 'aspect-square',
  '16:9': 'aspect-video',
  '4:5': 'aspect-[4/5]',
  '9:16': 'aspect-[9/16]',
} as const;

/** One shot of the board: header, still and fields, footer with status and actions. */
export default function StoryboardShotCard({
  brandId,
  cast,
  characterReplacement,
  endSeconds,
  format,
  index,
  isDisabled,
  isSelected,
  isTimingDisabled,
  onChangeDuration,
  onDelete,
  onGenerateStill,
  onMove,
  onPatch,
  runId,
  shot,
  shotCount,
  startSeconds,
  still,
  supportedDurations,
}: StoryboardShotCardProps) {
  const translate = useTranslations('pages.studioStoryboard.plan');
  const [isReplaceOpen, setIsReplaceOpen] = useState(
    Boolean(characterReplacement),
  );
  const [draggedSeconds, setDraggedSeconds] = useState<number>();
  const durations = [...new Set(supportedDurations)].sort((a, b) => a - b);
  const minSeconds = durations[0];
  const maxSeconds = durations[durations.length - 1];
  const hasDurationRange =
    durations.length > 1 &&
    minSeconds !== undefined &&
    maxSeconds !== undefined;
  const shownSeconds = draggedSeconds ?? shot.durationSeconds;
  const speaker = cast.find((member) => member.id === shot.speakerId);
  const isStillFresh = shot.stillFreshness === 'fresh';
  const isStillGenerating = shot.stillFreshness === 'generating';
  const label = translate('shot', { ordinal: shot.ordinal });
  return (
    <section
      id={`shot-${shot.id}`}
      aria-label={label}
      className="scroll-mt-4"
      data-selected={isSelected || undefined}
    >
      <Card
        variant={CardVariant.BORDERED}
        bodyClassName="gap-0 p-0"
        className={cn(isSelected && 'border-border-strong')}
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
          <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-xs tabular-nums text-muted-foreground">
            {String(shot.ordinal).padStart(2, '0')}
          </span>
          <EditableText
            ariaLabel={translate('shotNameFor', { ordinal: shot.ordinal })}
            className="min-w-0 flex-1"
            displayClassName="text-sm font-semibold"
            isDisabled={isDisabled}
            maxLength={40}
            onSave={(value) => onPatch({ sectionLabel: value })}
            placeholder={translate('shotNamePlaceholder')}
            value={shot.sectionLabel ?? ''}
          />
          <span className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
            {formatStoryboardTimecode(startSeconds)}–
            {formatStoryboardTimecode(endSeconds)}
          </span>
          <div className="ml-auto flex items-center gap-3">
            {hasDurationRange ? (
              <Slider
                aria-label={translate('shotDuration', {
                  ordinal: shot.ordinal,
                })}
                className="w-28"
                disabled={isDisabled || isTimingDisabled}
                max={maxSeconds}
                min={minSeconds}
                onValueChange={([seconds]) => setDraggedSeconds(seconds)}
                onValueCommit={([seconds]) => {
                  // A keyboard step commits before it reports the change, so the
                  // drag preview is cleared after both have run.
                  queueMicrotask(() => setDraggedSeconds(undefined));
                  onChangeDuration(seconds);
                }}
                step={storyboardDurationStep(durations)}
                value={[shownSeconds ?? minSeconds]}
              />
            ) : null}
            <span
              className="w-10 text-right text-sm font-semibold tabular-nums"
              data-testid={`shot-duration-${shot.ordinal}`}
            >
              {shownSeconds === null || shownSeconds === undefined
                ? translate('durationUnset')
                : `${shownSeconds} ${translate('secondsUnit')}`}
            </span>
          </div>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-2">
            {isStillGenerating ? (
              <div
                aria-busy="true"
                className={cn(
                  'flex items-center justify-center rounded-md border border-border bg-muted p-2',
                  STILL_ASPECT_CLASSES[format],
                )}
              >
                <GenerationStatus
                  status="generating"
                  label={translate('stillGenerating')}
                  compact
                  isStacked
                />
              </div>
            ) : still ? (
              <AgentMediaArtifactPreview
                displayMode="featured"
                assets={[
                  {
                    kind: 'image',
                    url: still.url,
                    title: still.title,
                    width: still.width,
                    height: still.height,
                    alt: translate('stillAlt', { ordinal: shot.ordinal }),
                  },
                ]}
              />
            ) : (
              <p
                className={cn(
                  'flex items-center justify-center rounded-md border border-border p-2 text-center text-xs text-muted-foreground',
                  STILL_ASPECT_CLASSES[format],
                )}
              >
                {translate('stillUnavailable')}
              </p>
            )}
            {shot.stillFreshness === 'failed' ? (
              <GenerationStatus
                status="failed"
                label={translate('stillFailed')}
                compact
              />
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <Field label={translate('action')}>
              <Textarea
                value={shot.action}
                maxLength={4000}
                disabled={isDisabled}
                onChange={(event) => onPatch({ action: event.target.value })}
              />
            </Field>
            <Field
              label={translate('dialogue')}
              helpText={
                shot.dialogue?.trim() ? undefined : translate('noDialogue')
              }
            >
              <Textarea
                value={shot.dialogue ?? ''}
                maxLength={500}
                disabled={isDisabled}
                onChange={(event) => onPatch({ dialogue: event.target.value })}
              />
            </Field>
            <div className="grid items-end gap-3 sm:grid-cols-2">
              <Field label={translate('speakerField')}>
                <StoryboardSelect
                  ariaLabel={translate('speakerForShot', {
                    ordinal: shot.ordinal,
                  })}
                  value={shot.speakerId}
                  placeholder={translate('chooseSpeaker')}
                  isDisabled={isDisabled}
                  options={cast.map((member) => ({
                    value: member.id,
                    label: member.name,
                  }))}
                  onChange={(speakerId) =>
                    onPatch({
                      speakerId,
                      onScreenSpeaker: speakerId ? shot.onScreenSpeaker : false,
                    })
                  }
                />
              </Field>
              <label className="flex h-8 items-center gap-2 text-sm">
                <Checkbox
                  checked={shot.onScreenSpeaker}
                  disabled={isDisabled || !speaker?.avatarAssetId}
                  onCheckedChange={(checked) =>
                    onPatch({ onScreenSpeaker: checked === true })
                  }
                />
                {translate('speakerOnScreen')}
              </label>
            </div>
            <Field label={translate('notes')}>
              <Textarea
                value={shot.notes ?? ''}
                maxLength={1000}
                disabled={isDisabled}
                onChange={(event) => onPatch({ notes: event.target.value })}
              />
            </Field>
          </div>
        </div>

        {isReplaceOpen ? (
          <div className="border-t border-border px-4 pb-4">
            <StoryboardCharacterReplace
              brandId={brandId}
              runId={runId}
              shotId={shot.id}
              isDisabled={isDisabled}
              saved={characterReplacement}
            />
          </div>
        ) : null}

        <div className="flex items-center gap-2 border-t border-border px-4 py-2">
          <Button
            aria-expanded={isReplaceOpen}
            icon={<UserRoundCog className="size-4" />}
            label={translate('replaceCharacter')}
            onClick={() => setIsReplaceOpen((open) => !open)}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
          />
          <span
            className={cn(
              'ml-auto flex items-center gap-1.5 text-xs',
              isStillFresh || isStillGenerating
                ? 'text-muted-foreground'
                : 'text-warning',
            )}
          >
            {isStillFresh ? (
              <CircleCheck className="size-3.5" aria-hidden />
            ) : (
              <CircleAlert className="size-3.5" aria-hidden />
            )}
            {translate('stillStatus', { status: shot.stillFreshness })}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                ariaLabel={translate('shotActions', { ordinal: shot.ordinal })}
                icon={<MoreHorizontal className="size-4" />}
                isDisabled={isDisabled}
                size={ButtonSize.ICON}
                tooltip={translate('shotActions', { ordinal: shot.ordinal })}
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onGenerateStill ? (
                <>
                  <DropdownMenuItem
                    disabled={isStillGenerating || !shot.action.trim()}
                    onSelect={onGenerateStill}
                  >
                    <ImagePlus className="mr-2 size-4" />
                    {shot.stillAssetId
                      ? translate('regenerateStill')
                      : translate('generateStill')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              ) : null}
              <DropdownMenuItem
                disabled={isTimingDisabled || index === 0}
                onSelect={() => onMove(-1)}
              >
                <ArrowUp className="mr-2 size-4" />
                {translate('moveShotUp', { ordinal: shot.ordinal })}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={isTimingDisabled || index === shotCount - 1}
                onSelect={() => onMove(1)}
              >
                <ArrowDown className="mr-2 size-4" />
                {translate('moveShotDown', { ordinal: shot.ordinal })}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onSelect={onDelete}
              >
                <Trash2 className="mr-2 size-4" />
                {translate('deleteShot')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Card>
    </section>
  );
}
