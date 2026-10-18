import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers';
import type {
  ClipResultMode,
  ClipsInputFormProps,
} from '@props/studio/clips.props';
import PromptBarContainer from '@ui/layout/prompt-bar-container/PromptBarContainer';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import PromptBarCompactSelect from '@ui/prompt-bars/components/toolbar/PromptBarCompactSelect';
import PromptBarSendButton from '@ui/prompt-bars/components/toolbar/PromptBarSendButton';
import PromptBarToolbar from '@ui/prompt-bars/components/toolbar/PromptBarToolbar';
import { CirclePlay, Search, SlidersHorizontal, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { KeyboardEvent, ReactNode } from 'react';

function isClipResultMode(value: string): value is ClipResultMode {
  return value === 'raw-cut' || value === 'avatar';
}

/**
 * Where a clip project starts: the source, how to cut it, and the one action
 * that begins. It is a single prompt bar, so the source field, hints, upload
 * progress and errors all live inside the bar rather than around it.
 */
export default function ClipsInputForm({
  draftFilename,
  draftSaveState,
  error,
  generationMode,
  isSubmitting,
  maxClips,
  minViralityScore,
  onAnalyze,
  onCancel,
  onModeChange,
  onStartQuick,
  onSetMaxClips,
  onSetMinViralityScore,
  onSetSourceFile,
  onSetSourceKind,
  onSetYoutubeUrl,
  quickStartHint,
  sourceFile,
  sourceOnly = false,
  sourceKind,
  uploadProgress,
  youtubeUrl,
}: ClipsInputFormProps) {
  const t = useTranslations('pages.studioClips');
  const hasSource =
    sourceKind === 'youtube'
      ? youtubeUrl.trim().length > 0
      : Boolean(sourceFile);
  const isPrimaryBlocked = isSubmitting || !hasSource;
  const primaryAction = sourceOnly ? onAnalyze : onStartQuick;
  const primaryLabel = sourceOnly
    ? isSubmitting
      ? t('importingSource')
      : t('importAndTranscribe')
    : isSubmitting
      ? t('starting')
      : t('startClipFactory');
  const hint = sourceOnly ? t('importCreditsNotice') : quickStartHint;
  // A saved draft stays silent; only a failed save is worth interrupting for.
  const isDraftSaveFailed = draftSaveState === 'error';

  const handleSourceKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !isPrimaryBlocked) {
      event.preventDefault();
      primaryAction();
    }
  };

  const sourceKindButton = (
    kind: ClipsInputFormProps['sourceKind'],
    label: string,
    icon: ReactNode,
  ) => (
    <Button
      variant={ButtonVariant.GHOST}
      size={ButtonSize.SM}
      textTransform="none"
      withWrapper={false}
      aria-pressed={sourceKind === kind}
      onClick={() => onSetSourceKind(kind)}
      className={cn(
        'gap-2',
        sourceKind === kind
          ? 'bg-hover text-foreground'
          : 'text-muted-foreground',
      )}
      icon={icon}
      label={label}
    />
  );

  return (
    <div className="w-full">
      <PromptBarContainer layoutMode="inflow" maxWidth="full">
        <PromptBarComposer
          banner={
            error || isDraftSaveFailed ? (
              <div className="grid gap-1 px-3.5 py-2.5 text-sm text-destructive">
                {error ? <p role="alert">{error}</p> : null}
                {isDraftSaveFailed ? (
                  <p data-testid="clips-draft-save-state" role="status">
                    {t('draftSaveFailed')}
                  </p>
                ) : null}
              </div>
            ) : undefined
          }
          beforeBody={
            <fieldset className="flex flex-wrap items-center gap-1 px-3 pt-3">
              <legend className="sr-only">{t('source')}</legend>
              {sourceKindButton(
                'youtube',
                t('youtubeUrl'),
                <CirclePlay className="size-4 shrink-0" />,
              )}
              {sourceKindButton(
                'upload',
                t('uploadAudioOrVideo'),
                <Upload className="size-4 shrink-0" />,
              )}
            </fieldset>
          }
          data-testid="clips-prompt-bar"
          density="compact"
        >
          {sourceKind === 'youtube' ? (
            <Input
              aria-label={t('youtubeUrl')}
              className="border-0 bg-transparent px-0 shadow-none"
              onChange={(event) => onSetYoutubeUrl(event.target.value)}
              onKeyDown={handleSourceKeyDown}
              placeholder={t('youtubeUrlPlaceholder')}
              type="url"
              value={youtubeUrl}
            />
          ) : (
            <div className="grid gap-1.5">
              <Input
                accept="audio/*,video/*"
                aria-label={t('audioOrVideoFile')}
                className="border-0 bg-transparent px-0 shadow-none"
                onChange={(event) =>
                  onSetSourceFile(event.target.files?.[0] ?? null)
                }
                type="file"
              />
              <p className="text-xs text-muted-foreground">
                {t('sourceLimits')}
              </p>
              {sourceFile ? (
                <p className="text-xs text-foreground" role="status">
                  {t('fileSizeMegabytes', {
                    name: sourceFile.name,
                    size: (sourceFile.size / 1024 / 1024).toFixed(1),
                  })}
                </p>
              ) : draftFilename ? (
                <p className="text-xs text-foreground" role="status">
                  {t('draftRepickFile', { name: draftFilename })}
                </p>
              ) : null}
              {isSubmitting && uploadProgress > 0 ? (
                <div
                  aria-label={t('uploadProgressAria', {
                    progress: uploadProgress,
                  })}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={uploadProgress}
                  role="progressbar"
                >
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('uploadingSource', { progress: uploadProgress })}
                  </p>
                </div>
              ) : null}
            </div>
          )}
          {hint ? (
            <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
          ) : null}
          <PromptBarToolbar
            density="compact"
            leading={
              sourceOnly ? null : (
                <>
                  <PromptBarCompactSelect
                    ariaLabel={t('generationMode')}
                    density="compact"
                    onChange={(value) => {
                      if (isClipResultMode(value)) onModeChange(value);
                    }}
                    options={[
                      { label: t('modeRawCut'), value: 'raw-cut' },
                      { label: t('modeAvatar'), value: 'avatar' },
                    ]}
                    value={generationMode}
                  />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        ariaLabel={t('clipSettings')}
                        icon={<SlidersHorizontal className="size-4" />}
                        size={ButtonSize.ICON}
                        tooltip={t('clipSettings')}
                        tooltipPosition="top"
                        variant={ButtonVariant.GHOST}
                        withWrapper={false}
                      />
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-[min(20rem,calc(100vw-2rem))]"
                      collisionPadding={16}
                      side="top"
                      sideOffset={8}
                    >
                      <div className="grid gap-4">
                        <div>
                          <label
                            htmlFor="max-clips"
                            className="mb-1.5 flex items-center justify-between text-xs font-medium text-foreground"
                          >
                            <span>{t('maxClips')}</span>
                            <span className="text-muted-foreground">
                              {maxClips}
                            </span>
                          </label>
                          <Input
                            id="max-clips"
                            type="range"
                            min={1}
                            max={30}
                            value={maxClips}
                            onChange={(event) =>
                              onSetMaxClips(Number(event.target.value))
                            }
                            className="w-full accent-primary"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="min-virality"
                            className="mb-1.5 flex items-center justify-between text-xs font-medium text-foreground"
                          >
                            <span>{t('minViralityScore')}</span>
                            <span className="text-muted-foreground">
                              {minViralityScore}
                            </span>
                          </label>
                          <Input
                            id="min-virality"
                            type="range"
                            min={0}
                            max={100}
                            value={minViralityScore}
                            onChange={(event) =>
                              onSetMinViralityScore(Number(event.target.value))
                            }
                            className="w-full accent-primary"
                          />
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </>
              )
            }
            trailing={
              <>
                {onCancel && !sourceOnly ? (
                  <Button
                    label={t('cancel')}
                    onClick={onCancel}
                    size={ButtonSize.SM}
                    textTransform="none"
                    variant={ButtonVariant.GHOST}
                  />
                ) : null}
                {sourceOnly ? null : (
                  <Button
                    icon={<Search className="size-3.5" />}
                    isDisabled={isPrimaryBlocked}
                    label={t('reviewHighlightsFirst')}
                    onClick={onAnalyze}
                    size={ButtonSize.SM}
                    textTransform="none"
                    variant={ButtonVariant.GHOST}
                  />
                )}
                <PromptBarSendButton
                  ariaLabel={primaryLabel}
                  density="compact"
                  isDisabled={isPrimaryBlocked}
                  isLoading={isSubmitting}
                  onClick={primaryAction}
                  tooltip={primaryLabel}
                />
              </>
            }
          />
        </PromptBarComposer>
      </PromptBarContainer>
    </div>
  );
}
