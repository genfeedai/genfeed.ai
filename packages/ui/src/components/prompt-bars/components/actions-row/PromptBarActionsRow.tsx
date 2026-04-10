'use client';

import {
  AiActionType,
  ButtonVariant,
  ComponentSize,
  IngredientCategory,
} from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { IAsset, IImage } from '@genfeedai/interfaces';
import type { Image as ImageModel } from '@genfeedai/models/ingredients/image.model';
import type { PromptBarActionsRowProps } from '@genfeedai/props/prompt-bars/prompt-bar-layout.props';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import AiActionGroup from '@ui/ai/AiActionGroup';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import FormDropdown from '@ui/primitives/dropdown-field';
import Image from 'next/image';
import { type ChangeEvent, memo, useCallback } from 'react';
import {
  HiArrowUp,
  HiDocumentDuplicate,
  HiMicrophone,
  HiNoSymbol,
  HiSparkles,
  HiSquaresPlus,
  HiTv,
} from 'react-icons/hi2';

const PromptBarActionsRow = memo(function PromptBarActionsRow({
  aiActionsConfig,
  iconButtonClass,
  currentConfig,
  form,
  openGallery,
  handleReferenceSelect,
  handleSelectAccountReference,
  references,
  referenceSource,
  setReferenceSource,
  setReferences,
  supportsMultipleReferences,
  maxReferenceCount,
  isDisabledState,
  hasEndFrame,
  endFrame,
  setEndFrame,
  hasAnyImagenModel,
  isOnlyImagenModels,
  watchedFormat,
  isSupported,
  toggleVoice,
  isRecording,
  isProcessing,
  handleCopy,
  enhancePrompt,
  isGenerating,
  isEnhancing,
  normalizedWatchedModels,
  getMinFromAllModels,
  getModelMaxOutputs,
  refocusTextarea,
  controlClass,
  isGenerateDisabled,
  selectedModelCost,
  handleSubmitForm,
  activeGenerationsCount,
  generateLabel,
  isFormValid,
}: PromptBarActionsRowProps) {
  const handleOpenGallery = useCallback(() => {
    openGallery({
      category: IngredientCategory.IMAGE,
      format: watchedFormat,
      maxSelectableItems: supportsMultipleReferences ? maxReferenceCount : 1,
      onSelect: handleReferenceSelect as (
        item:
          | ImageModel
          | ImageModel[]
          | IAsset
          | IAsset[]
          | IImage
          | IImage[]
          | null,
      ) => void,
      onSelectAccountReference: handleSelectAccountReference,
      selectedReferences: references.map((reference) => reference.id),
      title: 'Select Reference Images',
    });
  }, [
    handleReferenceSelect,
    handleSelectAccountReference,
    maxReferenceCount,
    openGallery,
    references,
    supportsMultipleReferences,
    watchedFormat,
  ]);

  const handleVoiceClick = useCallback(() => {
    if (isDisabledState || isProcessing) {
      return;
    }
    toggleVoice();
  }, [isDisabledState, isProcessing, toggleVoice]);

  function getVoiceButtonTooltip(): string {
    if (isRecording) {
      return 'Stop recording';
    }
    if (isProcessing) {
      return 'Processing...';
    }
    return 'Voice input (Speak to transcribe)';
  }

  function getReferenceButtonTooltip(): string {
    if (hasEndFrame && endFrame) {
      return 'Disabled when end frame selected';
    }
    if (hasAnyImagenModel) {
      return 'Reference images will not be used for Imagen models';
    }
    if (supportsMultipleReferences) {
      return `References (${references.length}/${maxReferenceCount})`;
    }
    return 'Reference';
  }

  function renderOutputsDropdown(): React.ReactNode {
    if (normalizedWatchedModels.length === 0) {
      return null;
    }

    const maxOutputs = getMinFromAllModels((modelKey) =>
      getModelMaxOutputs(modelKey),
    );

    const outputOptions = Array.from({ length: maxOutputs }, (_, i) => ({
      key: String(i + 1),
      label: `${i + 1}x`,
    }));

    return (
      <FormDropdown
        key="outputs"
        name="outputs"
        icon={<HiSquaresPlus />}
        label="Outputs"
        isFullWidth={false}
        dropdownDirection="up"
        className={controlClass}
        value={String(form.getValues('outputs') || 1)}
        options={outputOptions}
        isNoneEnabled={false}
        isDisabled={isDisabledState}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => {
          form.setValue('outputs', parseInt(event.target.value, 10), {
            shouldValidate: true,
          });
          refocusTextarea();
        }}
      />
    );
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {currentConfig.buttons?.reference && !isOnlyImagenModels && (
          <>
            <Button
              tooltipPosition="top"
              className={iconButtonClass}
              onClick={handleOpenGallery}
              isDisabled={isDisabledState || (hasEndFrame && endFrame !== null)}
              tooltip={getReferenceButtonTooltip()}
              icon={
                references.length > 0 ? (
                  <div className="relative w-8 h-8 overflow-hidden">
                    <Image
                      src={
                        referenceSource === 'brand'
                          ? `${EnvironmentService.ingredientsEndpoint}/references/${references[0].id}`
                          : `${EnvironmentService.ingredientsEndpoint}/images/${references[0].id}`
                      }
                      alt="Reference"
                      className="w-full h-full object-cover"
                      width={32}
                      height={32}
                      sizes="32px"
                    />

                    {supportsMultipleReferences && references.length > 1 && (
                      <div className="absolute inset-0 flex items-center justify-center text-black text-xs font-bold">
                        {references.length}
                      </div>
                    )}
                  </div>
                ) : (
                  <HiTv className="w-4 h-4" />
                )
              }
            />

            {hasEndFrame && (
              <>
                <Button
                  onClick={() => {
                    openGallery({
                      category: IngredientCategory.IMAGE,
                      format: watchedFormat,
                      onSelect: (selection) => {
                        const item = Array.isArray(selection)
                          ? selection[0]
                          : selection;

                        if (item) {
                          setEndFrame(item);
                          form.setValue('endFrame', item.id, {
                            shouldValidate: true,
                          });
                        }
                      },
                      title: 'Select End Frame',
                    });
                  }}
                  isDisabled={references.length > 0}
                  tooltip={
                    references.length > 0
                      ? 'Disabled when references selected'
                      : 'End Frame'
                  }
                  tooltipPosition="top"
                  className={iconButtonClass}
                  icon={
                    endFrame ? (
                      <div className="relative w-8 h-8 overflow-hidden">
                        <Image
                          src={`${EnvironmentService.ingredientsEndpoint}/images/${endFrame.id}`}
                          alt="End Frame"
                          className="w-full h-full object-cover"
                          width={32}
                          height={32}
                          sizes="32px"
                        />
                      </div>
                    ) : (
                      <HiTv className="w-4 h-4" />
                    )
                  }
                />

                {endFrame && (
                  <Button
                    onClick={() => {
                      setEndFrame(null);
                      form.setValue('endFrame', '', {
                        shouldValidate: true,
                      });
                    }}
                    tooltipPosition="top"
                    className={iconButtonClass}
                    tooltip="Clear end frame"
                    icon={<HiNoSymbol className="w-4 h-4" />}
                  />
                )}
              </>
            )}
          </>
        )}

        {currentConfig.buttons?.model && (
          <Checkbox
            name="brandingMode"
            control={form.control}
            label="Branding"
            isDisabled={isDisabledState}
            isChecked={form.getValues('brandingMode') === 'brand'}
            onChange={(event) => {
              form.setValue(
                'brandingMode',
                event.target.checked ? 'brand' : 'off',
                {
                  shouldValidate: true,
                },
              );
            }}
          />
        )}
      </div>

      <div className="flex items-center gap-2">
        {isSupported && (
          <Button
            onClick={handleVoiceClick}
            variant={isRecording ? ButtonVariant.DESTRUCTIVE : undefined}
            className={cn(iconButtonClass, isRecording && 'animate-pulse')}
            isDisabled={isDisabledState || isProcessing}
            tooltip={getVoiceButtonTooltip()}
            tooltipPosition="top"
            icon={
              isRecording ? (
                <HiMicrophone className="w-4 h-4" color="red" />
              ) : (
                <HiMicrophone className="w-4 h-4" />
              )
            }
          />
        )}

        <Button
          onClick={() => handleCopy(form.getValues('text'))}
          isDisabled={!form.getValues('text')}
          tooltip="Copy prompt"
          tooltipPosition="top"
          className={iconButtonClass}
          icon={<HiDocumentDuplicate className="w-4 h-4" />}
        />

        <Button
          onClick={enhancePrompt}
          tooltip="Enhance prompt"
          tooltipPosition="top"
          className={iconButtonClass}
          isDisabled={isGenerating || isEnhancing || !form.getValues('text')}
          icon={
            isEnhancing ? (
              <Spinner size={ComponentSize.XS} />
            ) : (
              <HiSparkles className="w-4 h-4" />
            )
          }
        />

        {aiActionsConfig && (
          <AiActionGroup
            actions={[AiActionType.SUGGEST_KEYWORDS, AiActionType.EXPAND]}
            content={form.getValues('text') || ''}
            onResult={(action, result) => {
              aiActionsConfig.onAiResult?.(action, result);
            }}
            isDisabled={isGenerating || isEnhancing || !form.getValues('text')}
            orgId={aiActionsConfig.orgId}
            token={aiActionsConfig.token}
          />
        )}

        {renderOutputsDropdown()}

        <Button
          variant={ButtonVariant.GENERATE}
          icon={<HiArrowUp />}
          isDisabled={isGenerateDisabled || !isFormValid}
          isLoading={isGenerating}
          onClick={handleSubmitForm}
          wrapperClassName="w-auto"
          ariaLabel={
            activeGenerationsCount > 0
              ? `${generateLabel} (Queue)`
              : generateLabel
          }
          className={cn(
            'h-10 w-10 p-0 transition-all duration-300',
            activeGenerationsCount > 0 && 'bg-yellow-500 hover:bg-yellow-600',
          )}
        />
      </div>
    </div>
  );
});

export default PromptBarActionsRow;
