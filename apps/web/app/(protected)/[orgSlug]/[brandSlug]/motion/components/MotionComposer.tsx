'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import PromptBarContainer from '@ui/layout/prompt-bar-container/PromptBarContainer';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { Textarea } from '@ui/primitives/textarea';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import PromptBarCompactSelect from '@ui/prompt-bars/components/toolbar/PromptBarCompactSelect';
import PromptBarSendButton from '@ui/prompt-bars/components/toolbar/PromptBarSendButton';
import PromptBarToolbar from '@ui/prompt-bars/components/toolbar/PromptBarToolbar';
import PromptEditor from '@ui/prompt-editor/PromptEditor';
import { SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import type { MotionControllerProps } from '@/features/motion/props/motion-workspace.props';
import MotionAdvancedSettings from './MotionAdvancedSettings';
import MotionNotice from './MotionNotice';
import MotionQuoteReview from './MotionQuoteReview';

/**
 * The one Motion prompt bar. Without a project it composes a new visual; on an
 * open project it revises that project and quotes exports and retries. The
 * quote the creator approves renders inside the bar.
 */
export default function MotionComposer({
  controller,
}: MotionControllerProps): ReactElement {
  const t = useTranslations('pages.studioMotion');
  const {
    assetIds,
    catalog,
    catalogModels,
    error,
    formats,
    frames,
    inheritedOutputs,
    isAcknowledged,
    isBusy,
    isQuoteBlocked,
    label,
    libraryAssets,
    mode,
    modeOptions,
    modelKey,
    modelOptions,
    project,
    propsText,
    requestQuote,
    review,
    revision,
    selectedModel,
    setIsAcknowledged,
    settings,
    submit,
    submitFromEditor,
    text,
    toggleAsset,
    toggleFormat,
    updateFrames,
    updateLabel,
    updateMode,
    updateModel,
    updatePropsText,
    updateSetting,
    updateText,
  } = controller;
  const hasNotice = Boolean(error || (catalog && !catalog.isAvailable));
  const banner =
    hasNotice || review ? (
      <div className="grid gap-4 p-3.5">
        {hasNotice ? <MotionNotice controller={controller} /> : null}
        {review && (
          <MotionQuoteReview
            isAcknowledged={isAcknowledged}
            isBusy={isBusy}
            isVisionUnverified={
              catalogModels.find((model) => model.key === review.quote.modelKey)
                ?.inspectionCapability === 'unknown'
            }
            onAcknowledgedChange={setIsAcknowledged}
            onConfirm={() => void submit()}
            review={review}
          />
        )}
      </div>
    ) : undefined;

  return (
    <PromptBarContainer
      className="mx-auto w-full max-w-2xl"
      layoutMode="inflow"
      maxWidth="full"
      zIndex={60}
    >
      <PromptBarComposer
        aria-label={t('compose')}
        banner={banner}
        beforeBody={
          <div className="grid gap-2 px-3.5 pt-3">
            {project ? <p className="gen-label">{t('revise')}</p> : null}
            {!project && (
              <Input
                aria-label={t('label')}
                className="h-7 border-0 bg-transparent px-0 shadow-none"
                maxLength={120}
                onChange={(event) => updateLabel(event.target.value)}
                placeholder={t('label')}
                value={label}
              />
            )}
          </div>
        }
        data-testid="motion-prompt-bar"
        density="compact"
        role="group"
      >
        {mode === 'prompt' ? (
          <PromptEditor
            ariaLabel={t('prompt')}
            className="min-h-12"
            onSubmit={submitFromEditor}
            onValueChange={updateText}
            placeholder={t('prompt')}
            value={text}
          />
        ) : (
          <Textarea
            aria-label={mode === 'props' ? t('props') : t('source')}
            className="border-0 bg-transparent px-0 font-mono text-xs shadow-none"
            onChange={(event) => updateText(event.target.value)}
            rows={mode === 'sourceCode' ? 12 : 6}
            value={text}
          />
        )}
        {mode === 'sourceCode' && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t('sourceHint')}
          </p>
        )}
        {!project && selectedModel?.inspectionCapability === 'unknown' && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t('unverifiedVision')}
          </p>
        )}
        <PromptBarToolbar
          leading={
            <>
              <PromptBarCompactSelect
                ariaLabel={t('inputMode')}
                onChange={updateMode}
                options={modeOptions}
                value={mode}
              />
              {!project && (
                <PromptBarCompactSelect
                  ariaLabel={t('model')}
                  onChange={updateModel}
                  options={modelOptions}
                  value={modelKey}
                />
              )}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    ariaLabel={t('settings')}
                    icon={<SlidersHorizontal className="size-4" />}
                    size={ButtonSize.ICON}
                    tooltip={t('settings')}
                    tooltipPosition="top"
                    variant={ButtonVariant.GHOST}
                    withWrapper={false}
                  />
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="max-h-[min(560px,var(--radix-popover-content-available-height,70vh))] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto"
                  collisionPadding={16}
                  side="top"
                  sideOffset={8}
                >
                  <MotionAdvancedSettings
                    assetIds={assetIds}
                    formats={formats}
                    frames={frames}
                    inheritedOutputs={inheritedOutputs}
                    isProject={Boolean(project)}
                    libraryAssets={libraryAssets}
                    onAssetToggle={toggleAsset}
                    onFormatToggle={toggleFormat}
                    onFramesChange={updateFrames}
                    onPropsTextChange={updatePropsText}
                    onSettingChange={updateSetting}
                    propsText={propsText}
                    settings={settings}
                  />
                </PopoverContent>
              </Popover>
            </>
          }
          trailing={
            <>
              {revision?.hasSource && (
                <Button
                  isDisabled={isQuoteBlocked}
                  label={t('quoteExport')}
                  onClick={() => void requestQuote('export')}
                  size={ButtonSize.SM}
                  textTransform="none"
                  variant={ButtonVariant.GHOST}
                />
              )}
              {revision?.hasSource &&
                ['failed', 'cancelled'].includes(revision.status) && (
                  <Button
                    isDisabled={isQuoteBlocked}
                    label={t('quoteRetry')}
                    onClick={() => void requestQuote('retry')}
                    size={ButtonSize.SM}
                    textTransform="none"
                    variant={ButtonVariant.GHOST}
                  />
                )}
              <PromptBarSendButton
                ariaLabel={t('getQuote')}
                isDisabled={isQuoteBlocked}
                isLoading={isBusy}
                onClick={submitFromEditor}
                tooltip={t('getQuote')}
              />
            </>
          }
        />
      </PromptBarComposer>
    </PromptBarContainer>
  );
}
