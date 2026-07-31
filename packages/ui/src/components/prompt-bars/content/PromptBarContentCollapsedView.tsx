'use client';

import { ButtonSize, ButtonVariant, Platform } from '@genfeedai/enums';
import type { PromptBarContentCollapsedViewProps } from '@genfeedai/props/prompt-bars/prompt-bar-content.props';
import { Button } from '@ui/primitives/button';
import FormDropdown from '@ui/primitives/dropdown-field';
import { Input } from '@ui/primitives/input';
import PromptBarDivider from '@ui/prompt-bars/components/divider/PromptBarDivider';
import {
  COLLAPSE_BUTTON_CLASS,
  CONTROL_CLASS,
  POST_COUNT_CYCLE,
} from '@ui/prompt-bars/content/prompt-bar-content.helpers';
import { ArrowUp, Bookmark, ChevronUp, LayoutGrid, List } from 'lucide-react';
import type { ChangeEvent } from 'react';

export default function PromptBarContentCollapsedView({
  buttonLabel,
  count,
  isEnhancing,
  isSubmitDisabled,
  isThread,
  platform,
  presetOptions,
  prompt,
  promptPlaceholder,
  selectedPresetKey,
  showCountDropdown,
  showThreadToggle,
  onCountChange,
  onExpand,
  onKeyDown,
  onPresetChange,
  onPromptChange,
  onSubmit,
  onThreadChange,
}: PromptBarContentCollapsedViewProps) {
  return (
    <div className="flex items-center gap-2">
      {presetOptions.length > 0 && (
        <FormDropdown
          name="preset"
          icon={<Bookmark />}
          label="Preset"
          value={selectedPresetKey}
          isFullWidth={false}
          isNoneEnabled={true}
          dropdownDirection="up"
          className={CONTROL_CLASS}
          options={presetOptions}
          isDisabled={isEnhancing}
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            onPresetChange(event.target.value)
          }
        />
      )}

      <Input
        name="prompt"
        type="text"
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={promptPlaceholder}
        isDisabled={isEnhancing}
        className="h-9 flex-1 border border-white/10 bg-white/[0.03] px-3 text-sm text-white/90 focus:border-white/20 focus:outline-none"
      />

      {(showCountDropdown || showThreadToggle) && (
        <>
          <PromptBarDivider className="h-5 bg-white/10" />
          <div className="flex items-center gap-2">
            {showCountDropdown && (
              <Button
                label={`${count}x`}
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.SM}
                className="h-9 px-3"
                tooltip="Outputs"
                tooltipPosition="left"
                icon={<LayoutGrid className="size-4" />}
                onClick={() => onCountChange(POST_COUNT_CYCLE[count] ?? 1)}
                isDisabled={isEnhancing}
              />
            )}
            {showThreadToggle && platform === Platform.TWITTER && (
              <Button
                ariaLabel="Thread"
                onClick={() => onThreadChange(!isThread)}
                tooltip={isThread ? 'Thread mode' : 'Individual posts'}
                tooltipPosition="top"
                variant={
                  isThread ? ButtonVariant.DEFAULT : ButtonVariant.SECONDARY
                }
                className="size-9 p-0"
                icon={<List className="size-4" />}
                isDisabled={isEnhancing}
              />
            )}
          </div>
        </>
      )}

      <PromptBarDivider className="h-5 bg-white/10" />

      <div className="flex items-center gap-2">
        <Button
          variant={ButtonVariant.DEFAULT}
          icon={<ArrowUp />}
          label={buttonLabel}
          tooltip={buttonLabel}
          isLoading={isEnhancing}
          isDisabled={isSubmitDisabled}
          onClick={onSubmit}
          className="h-9 px-3.5"
        />
        <Button
          ariaLabel="Expand prompt bar"
          onClick={onExpand}
          tooltip="Expand prompt bar"
          tooltipPosition="top"
          variant={ButtonVariant.GHOST}
          className={COLLAPSE_BUTTON_CLASS}
          icon={<ChevronUp className="size-4" />}
        />
      </div>
    </div>
  );
}
