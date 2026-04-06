'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/enums';
import { BG_BLUR, BORDER_WHITE_30, cn } from '@helpers/formatting/cn/cn.util';
import type { PromptBarContentProps } from '@props/prompt-bars/prompt-bar-content.props';
import Button from '@ui/buttons/base/Button';
import Spinner from '@ui/feedback/spinner/Spinner';
import FormInput from '@ui/forms/inputs/input/form-input/FormInput';
import FormDropdown from '@ui/forms/selectors/dropdown/form-dropdown/FormDropdown';
import { Textarea } from '@ui/primitives/textarea';
import PromptBarDivider from '@ui/prompt-bars/components/divider/PromptBarDivider';
import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  HiArrowUp,
  HiBookmark,
  HiChevronUp,
  HiSparkles,
} from 'react-icons/hi2';

export default function PromptBarArticle({
  onSubmit,
  isEnhancing,
  presets = [],
}: PromptBarContentProps) {
  const [prompt, setPrompt] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedPresetKey, setSelectedPresetKey] = useState('');
  const prevIsEnhancingRef = useRef(isEnhancing);

  useEffect(() => {
    if (prevIsEnhancingRef.current && !isEnhancing) {
      setPrompt('');
    }
    prevIsEnhancingRef.current = isEnhancing;
  }, [isEnhancing]);

  useEffect(() => {
    if (
      !presets.find(
        (preset: { key: string }) => preset.key === selectedPresetKey,
      )
    ) {
      setSelectedPresetKey('');
    }
  }, [presets, selectedPresetKey]);

  const presetOptions = useMemo(
    () =>
      presets.map((preset: { key: string; label: string }) => ({
        key: preset.key,
        label: preset.label,
      })),
    [presets],
  );

  function handlePresetChange(value: string): void {
    setSelectedPresetKey(value);
    const preset = presets.find(
      (p: { key: string; description: string }) => p.key === value,
    );
    if (preset) {
      setPrompt(preset.description);
    }
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (prompt.trim() && !isEnhancing) {
      await onSubmit(prompt.trim());
    }
  }

  function handleKeyDown(
    e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  }

  function renderPresetDropdown(): React.ReactNode {
    if (presetOptions.length === 0) {
      return null;
    }

    return (
      <FormDropdown
        name="preset"
        icon={<HiBookmark />}
        label="Preset"
        value={selectedPresetKey}
        isFullWidth={false}
        isNoneEnabled={true}
        dropdownDirection="up"
        className="h-10 px-3 gap-2 text-sm flex-shrink-0"
        options={presetOptions}
        isDisabled={isEnhancing}
        onChange={(e: ChangeEvent<HTMLSelectElement>) =>
          handlePresetChange(e.target.value)
        }
      />
    );
  }

  return (
    <div
      className={cn(
        BG_BLUR,
        BORDER_WHITE_30,
        ' shadow-lg flex flex-col transition-all duration-300',
        isCollapsed ? 'p-2 overflow-hidden' : 'p-4 space-y-2 overflow-visible',
      )}
    >
      {isCollapsed ? (
        <div className="flex items-center gap-2 animate-fade-in">
          {renderPresetDropdown()}

          <FormInput
            name="prompt"
            type="text"
            value={prompt}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setPrompt(e.target.value)
            }
            onKeyDown={handleKeyDown}
            placeholder="Describe how you want to enhance your content..."
            isDisabled={isEnhancing}
            className="bg-white/5 border border-white/15 focus:border-primary focus:outline-none text-sm h-10 flex-1 px-3"
          />

          <PromptBarDivider />

          <div className="flex items-center gap-2">
            <Button
              variant={ButtonVariant.GENERATE}
              icon={<HiArrowUp />}
              isLoading={isEnhancing}
              isDisabled={isEnhancing || !prompt.trim()}
              onClick={handleSubmit}
              tooltip="Enhance"
              size={ButtonSize.SM}
              className="h-10 w-10 p-0"
            />

            <Button
              onClick={() => setIsCollapsed(false)}
              tooltip="Expand prompt bar"
              tooltipPosition="top"
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
              className="h-10 w-10 p-0 flex-shrink-0"
              icon={<HiChevronUp className="transition-transform w-4 h-4" />}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 overflow-visible">
            <div className="flex flex-wrap items-center gap-2">
              {renderPresetDropdown()}
            </div>

            <Button
              onClick={() => setIsCollapsed(true)}
              tooltip="Collapse"
              tooltipPosition="top"
              variant={ButtonVariant.SECONDARY}
              className="h-10 w-10 p-0"
              icon={
                <HiChevronUp
                  className="transition-transform rotate-180"
                  size={16}
                />
              }
            />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col space-y-2">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe how you want to enhance your content..."
              disabled={isEnhancing}
              className="h-24 resize-none"
              rows={3}
            />

            <div className="flex items-center justify-end gap-2">
              <Button
                label={
                  <span className="inline-flex items-center gap-2">
                    {isEnhancing ? (
                      <>
                        <Spinner size={ComponentSize.XS} />
                        <span>Enhancing...</span>
                      </>
                    ) : (
                      <>
                        <HiSparkles className="w-4 h-4" />
                        <span>Enhance</span>
                      </>
                    )}
                  </span>
                }
                variant={ButtonVariant.DEFAULT}
                className="whitespace-nowrap"
                onClick={handleSubmit}
                isDisabled={isEnhancing || !prompt.trim()}
                type="submit"
              />
            </div>
          </form>
        </>
      )}
    </div>
  );
}
