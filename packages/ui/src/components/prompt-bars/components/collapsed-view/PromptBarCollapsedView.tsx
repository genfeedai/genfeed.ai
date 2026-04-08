'use client';

import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
  IngredientFormat,
} from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { PromptBarCollapsedViewProps } from '@props/prompt-bars/prompt-bar-layout.props';
import { EnvironmentService } from '@services/core/environment.service';
import Button from '@ui/buttons/base/Button';
import FormInput from '@ui/forms/inputs/input/form-input/FormInput';
import PromptBarDivider from '@ui/prompt-bars/components/divider/PromptBarDivider';
import Image from 'next/image';
import { type ChangeEvent, memo, useCallback, useMemo } from 'react';
import { useWatch } from 'react-hook-form';
import {
  HiArrowUp,
  HiChevronUp,
  HiMicrophone,
  HiSquaresPlus,
} from 'react-icons/hi2';

function getVoiceTooltip(isRecording: boolean, isProcessing: boolean): string {
  if (isRecording) {
    return 'Stop recording';
  }
  if (isProcessing) {
    return 'Processing...';
  }
  return 'Voice input (Speak to transcribe)';
}

const PromptBarCollapsedView = memo(function PromptBarCollapsedView({
  collapsedInputRef,
  form,
  placeholder,
  isDisabled,
  isGenerateBlocked,
  isGenerateDisabled,
  isGenerating,
  selectedModelCost,
  onSubmit,
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
}: PromptBarCollapsedViewProps) {
  const watchedText = useWatch({
    control: form.control,
    name: 'text',
  });

  const watchedTextTrimmed = useMemo(
    () => (watchedText as string)?.trim() || '',
    [watchedText],
  );

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      const cursorPos = event.target.selectionStart ?? value.length;

      isInternalUpdateRef.current = true;
      form.setValue('text', value, { shouldValidate: true });
      onTextChange?.();

      requestAnimationFrame(() => {
        if (collapsedInputRef.current) {
          collapsedInputRef.current.setSelectionRange(cursorPos, cursorPos);
        }
        isInternalUpdateRef.current = false;
      });
    },
    [collapsedInputRef, form, isInternalUpdateRef, onTextChange],
  );

  const hasReferences = references && references.length > 0;
  const firstReference = hasReferences ? references[0] : null;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-1.5 border border-white/14 bg-[#171717]/58 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_16px_40px_rgba(0,0,0,0.24)] backdrop-blur-xl">
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
              className="h-10 w-10 p-0 flex items-center justify-center"
              icon={
                <div className="relative w-8 h-8 overflow-hidden rounded">
                  <Image
                    src={
                      referenceSource === 'brand'
                        ? `${EnvironmentService.ingredientsEndpoint}/references/${firstReference.id}`
                        : `${EnvironmentService.ingredientsEndpoint}/images/${firstReference.id}`
                    }
                    alt="Reference"
                    className="w-full h-full object-cover"
                    width={32}
                    height={32}
                    sizes="32px"
                  />

                  {references.length > 1 && (
                    <div className="absolute inset-0 flex items-center justify-center text-black text-xs font-bold">
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
                className="h-10 w-10 p-0 flex items-center justify-center"
                icon={<span className="text-sm">✕</span>}
                onClick={onClearReferences}
                data-testid="clear-reference-button"
              />
            )}

            <PromptBarDivider className="h-5 bg-white/10" />
          </>
        )}

        <div className="relative flex-1">
          <FormInput
            name="text"
            type="text"
            inputRef={collapsedInputRef}
            value={form.getValues('text')}
            onChange={handleChange}
            placeholder={placeholder}
            isDisabled={isDisabled}
            className="h-10 w-full border-0 bg-transparent pl-3 pr-12 text-sm shadow-none focus:border-transparent focus:outline-none focus-visible:ring-0"
            data-testid="prompt-input"
          />
          <Button
            variant={ButtonVariant.GENERATE}
            icon={<HiArrowUp />}
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
              'absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 p-0 transition-all duration-300',
              activeGenerationsCount > 0 && 'bg-yellow-500 hover:bg-yellow-600',
            )}
            data-testid="generate-button"
          />
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
              className="h-10 w-10 p-0 flex items-center justify-center"
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
            <PromptBarDivider className="h-5 bg-white/10" />
            <Button
              label={`${outputs}x`}
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              className="h-10 px-2 gap-1"
              tooltip="Outputs"
              tooltipPosition="left"
              icon={<HiSquaresPlus className="w-4 h-4" />}
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
              <HiMicrophone
                className="w-4 h-4"
                color={isRecording ? 'red' : undefined}
              />
            }
          >
            Voice
          </Button>
        )}

        <PromptBarDivider className="h-5 bg-white/10" />

        <Button
          onClick={onExpand}
          tooltip="Expand prompt bar"
          tooltipPosition="top"
          variant={ButtonVariant.GHOST}
          className="h-10 w-10 p-0"
          icon={<HiChevronUp className="transition-transform w-4 h-4" />}
          data-testid="expand-button"
        />
      </div>
    </div>
  );
});

export default PromptBarCollapsedView;
