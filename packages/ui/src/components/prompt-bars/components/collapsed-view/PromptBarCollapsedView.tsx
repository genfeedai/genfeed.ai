'use client';

import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
  IngredientFormat,
} from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PromptBarCollapsedViewProps } from '@genfeedai/props/prompt-bars/prompt-bar-layout.props';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { Button } from '@ui/primitives/button';
import PromptBarDivider from '@ui/prompt-bars/components/divider/PromptBarDivider';
import PromptBarGenerationMeter from '@ui/prompt-bars/components/generation-meter/PromptBarGenerationMeter';
import PromptEditor from '@ui/prompt-editor/PromptEditor';
import { ArrowUp, ChevronUp, LayoutGrid, Mic, Square } from 'lucide-react';
import Image from 'next/image';
import { memo, useCallback, useMemo } from 'react';
import { useWatch } from 'react-hook-form';

function getVoiceTooltip(isRecording: boolean, isProcessing: boolean): string {
  if (isRecording) {
    return 'Stop recording';
  }
  if (isProcessing) {
    return 'Processing…';
  }
  return 'Voice input (Speak to transcribe)';
}

const PromptBarCollapsedView = memo(function PromptBarCollapsedView({
  collapsedInputRef: _collapsedInputRef,
  form,
  placeholder,
  isDisabled,
  isGenerateBlocked,
  isGenerateDisabled,
  isGenerating,
  generationMeter,
  onSubmit,
  onCancel,
  generateLabel,
  activeGenerationsCount,
  onExpand,
  isFormValid,
  isInternalUpdateRef,
  formatIcon,
  references,
  referenceSource,
  outputs,
  onOutputsChange,
  categoryType,
  onFormatChange,
  onClearReferences,
  watchedFormat,
  onTextChange,
  isSupported,
  toggleVoice,
  isRecording,
  isProcessing,
  extraExtensions,
  onDocumentChange,
}: PromptBarCollapsedViewProps) {
  const watchedText = useWatch({
    control: form.control,
    name: 'text',
  });

  const watchedTextTrimmed = useMemo(
    () => (watchedText as string)?.trim() || '',
    [watchedText],
  );

  const updatePromptBarCollapsedView = useCallback(
    (plainText: string) => {
      isInternalUpdateRef.current = true;
      form.setValue('text', plainText, { shouldValidate: true });
      onTextChange?.();
      isInternalUpdateRef.current = false;
    },
    [form, isInternalUpdateRef, onTextChange],
  );

  const submitCollapsedPrompt = useCallback(() => {
    onSubmit();
  }, [onSubmit]);

  const hasReferences = references && references.length > 0;
  const firstReference = hasReferences ? references[0] : null;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-1.5 bg-card/95 p-1.5 shadow-border-strong backdrop-blur-xl">
        {hasReferences && firstReference && (
          <>
            <Button
              tooltip={
                references.length > 1
                  ? `${references.length} references`
                  : 'Reference'
              }
              tooltipPosition="top"
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              className="size-10 p-0 flex items-center justify-center"
              icon={
                <div className="relative size-8 overflow-hidden rounded">
                  <Image
                    src={
                      referenceSource === 'brand'
                        ? `${EnvironmentService.cdnUrl}/references/${firstReference.id}`
                        : `${EnvironmentService.ingredientsEndpoint}/images/${firstReference.id}`
                    }
                    alt="Reference"
                    className="size-full object-cover"
                    width={32}
                    height={32}
                    sizes="32px"
                  />

                  {references.length > 1 && (
                    <div
                      className={
                        'absolute inset-0 flex items-center justify-center text-xs font-bold text-black' /* design-system-allow-content-color -- media overlay */
                      }
                    >
                      {references.length}
                    </div>
                  )}
                </div>
              }
            />

            {onClearReferences && (
              <Button
                tooltip="Clear reference"
                tooltipPosition="top"
                variant={ButtonVariant.GHOST}
                size={ButtonSize.SM}
                className="size-10 p-0 flex items-center justify-center"
                icon={<span className="text-sm">✕</span>}
                onClick={onClearReferences}
                data-testid="clear-reference-button"
              />
            )}

            <PromptBarDivider className="h-5 bg-border" />
          </>
        )}

        <div className="relative flex-1">
          <PromptEditor
            ariaLabel="Prompt"
            className="h-10 w-full pl-3 pr-12"
            editorClassName="py-2"
            extraExtensions={extraExtensions}
            isDisabled={isDisabled}
            onDocumentChange={onDocumentChange}
            onSubmit={submitCollapsedPrompt}
            onValueChange={updatePromptBarCollapsedView}
            placeholder={placeholder}
            testId="prompt-input"
            value={typeof watchedText === 'string' ? watchedText : ''}
          />
          {isGenerating && onCancel ? (
            <Button
              variant={ButtonVariant.DESTRUCTIVE}
              icon={
                <Square
                  aria-hidden
                  className="size-2.5 fill-current stroke-none"
                />
              }
              onClick={onCancel}
              tooltip="Stop"
              tooltipPosition="top"
              ariaLabel="Stop generation"
              className={cn(
                'absolute right-1.5 top-1/2 -translate-y-1/2 size-8 p-0 transition-all duration-300',
              )}
              data-testid="stop-generation-button"
            />
          ) : (
            <Button
              variant={ButtonVariant.DEFAULT}
              icon={<ArrowUp />}
              isDisabled={
                isGenerateBlocked ||
                isGenerateDisabled ||
                !isFormValid ||
                !watchedTextTrimmed
              }
              isLoading={isGenerating}
              onClick={() => onSubmit()}
              tooltip={
                activeGenerationsCount > 0
                  ? `${generateLabel} (Queue)`
                  : generateLabel
              }
              tooltipPosition="top"
              ariaLabel={
                activeGenerationsCount > 0
                  ? `${generateLabel} (Queue)`
                  : generateLabel
              }
              className={cn(
                'absolute right-1.5 top-1/2 -translate-y-1/2 size-8 p-0 transition-all duration-300',
                activeGenerationsCount > 0 && 'bg-warning hover:bg-warning/90',
              )}
              data-testid="generate-button"
            />
          )}
        </div>

        {formatIcon &&
          onFormatChange &&
          watchedFormat &&
          (categoryType === IngredientCategory.IMAGE ||
            categoryType === IngredientCategory.VIDEO) && (
            <Button
              tooltipPosition="left"
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              className="size-10 p-0 flex items-center justify-center"
              icon={formatIcon}
              tooltip={
                {
                  [IngredientFormat.LANDSCAPE]: 'Landscape (16:9)',
                  [IngredientFormat.PORTRAIT]: 'Portrait (9:16)',
                  [IngredientFormat.SQUARE]: 'Square (1:1)',
                }[watchedFormat] || 'Landscape (16:9)'
              }
              onClick={() => {
                const formatCycle: Record<IngredientFormat, IngredientFormat> =
                  {
                    [IngredientFormat.PORTRAIT]: IngredientFormat.SQUARE,
                    [IngredientFormat.SQUARE]: IngredientFormat.LANDSCAPE,
                    [IngredientFormat.LANDSCAPE]: IngredientFormat.PORTRAIT,
                  };
                onFormatChange(formatCycle[watchedFormat]);
              }}
              data-testid="format-button"
            />
          )}

        {outputs !== undefined && onOutputsChange && (
          <>
            <PromptBarDivider className="h-5 bg-border" />
            <Button
              label={`${outputs}x`}
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              className="h-10 px-2 gap-1"
              tooltip="Outputs"
              tooltipPosition="left"
              icon={<LayoutGrid className="size-4" />}
              onClick={() => {
                const next = outputs >= 4 ? 1 : outputs + 1;
                onOutputsChange(next);
              }}
              data-testid="outputs-button"
            />
          </>
        )}

        {isSupported && !watchedTextTrimmed && (
          <Button
            onClick={toggleVoice}
            variant={
              isRecording ? ButtonVariant.DESTRUCTIVE : ButtonVariant.GHOST
            }
            className={cn(
              'px-4 transition-all duration-300 flex-shrink-0',
              isRecording && 'animate-pulse',
            )}
            isDisabled={isGenerateBlocked || isProcessing}
            tooltip={getVoiceTooltip(
              isRecording ?? false,
              isProcessing ?? false,
            )}
            tooltipPosition="top"
            icon={
              <Mic
                className={cn('size-4', isRecording && 'text-destructive')}
                color={isRecording ? 'currentColor' : undefined}
              />
            }
          >
            Voice
          </Button>
        )}

        {generationMeter ? (
          <PromptBarGenerationMeter meter={generationMeter} />
        ) : null}

        <PromptBarDivider className="h-5 bg-border" />

        <Button
          onClick={onExpand}
          tooltip="Expand prompt bar"
          tooltipPosition="top"
          variant={ButtonVariant.GHOST}
          className="size-10 p-0"
          icon={<ChevronUp className="transition-transform size-4" />}
          data-testid="expand-button"
        />
      </div>
    </div>
  );
});

export default PromptBarCollapsedView;
