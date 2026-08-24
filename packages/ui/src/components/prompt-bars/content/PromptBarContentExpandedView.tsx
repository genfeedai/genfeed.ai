'use client';

import { ButtonVariant, Platform } from '@genfeedai/enums';
import { getPostsPlatformLabel } from '@genfeedai/helpers/content/posts.helper';
import { getPlatformIcon } from '@genfeedai/helpers/ui/platform-icon/platform-icon.helper';
import type { PromptBarContentExpandedViewProps } from '@genfeedai/props/prompt-bars/prompt-bar-content.props';
import { Button } from '@ui/primitives/button';
import FormDropdown from '@ui/primitives/dropdown-field';
import {
  COLLAPSE_BUTTON_CLASS,
  CONTROL_CLASS,
  POST_COUNT_OPTIONS,
} from '@ui/prompt-bars/content/prompt-bar-content.helpers';
import PromptEditor from '@ui/prompt-editor/PromptEditor';
import { ArrowUp, Bookmark, ChevronUp, LayoutGrid, List } from 'lucide-react';
import type { ChangeEvent, SyntheticEvent } from 'react';

export default function PromptBarContentExpandedView({
  buttonLabel,
  count,
  isEnhancing,
  isSubmitDisabled,
  isThread,
  platform,
  platformOptions,
  presetOptions,
  prompt,
  promptPlaceholder,
  selectedPresetKey,
  showCountDropdown,
  showThreadToggle,
  onCollapse,
  onCountChange,
  onKeyDown: _onKeyDown,
  onPlatformChange,
  onPresetChange,
  onPromptChange,
  onSubmit,
  onThreadChange,
}: PromptBarContentExpandedViewProps) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {onPlatformChange && (
            <FormDropdown
              name="platform"
              icon={
                platform === 'all' ? (
                  <LayoutGrid />
                ) : (
                  getPlatformIcon(platform as Platform)
                )
              }
              label={getPostsPlatformLabel(platform)}
              isFullWidth={false}
              dropdownDirection="up"
              className={CONTROL_CLASS}
              value={platform}
              options={platformOptions}
              isNoneEnabled={false}
              isDisabled={isEnhancing}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                onPlatformChange(event.target.value as Platform | 'all');
              }}
            />
          )}

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
        </div>

        <Button
          ariaLabel="Collapse"
          onClick={onCollapse}
          tooltip="Collapse"
          tooltipPosition="top"
          variant={ButtonVariant.GHOST}
          className={COLLAPSE_BUTTON_CLASS}
          icon={
            <ChevronUp className="rotate-180 transition-transform" size={16} />
          }
        />
      </div>

      <form onSubmit={onSubmit} className="mt-2 flex flex-col gap-2">
        <PromptEditor
          ariaLabel="Prompt"
          className="min-h-[96px] w-full border border-border p-2"
          isDisabled={isEnhancing}
          onSubmit={() => {
            onSubmit({ preventDefault() {} } as SyntheticEvent);
          }}
          onValueChange={onPromptChange}
          placeholder={promptPlaceholder}
          testId="prompt-textarea"
          value={prompt}
        />

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-2">
          {showCountDropdown && (
            <FormDropdown
              name="count"
              icon={<LayoutGrid />}
              label="Posts"
              isFullWidth={false}
              dropdownDirection="up"
              className={CONTROL_CLASS}
              value={String(count)}
              options={POST_COUNT_OPTIONS}
              isNoneEnabled={false}
              isDisabled={isEnhancing}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                onCountChange(Number(event.target.value));
              }}
            />
          )}
          {showThreadToggle && platform === Platform.TWITTER && (
            <Button
              onClick={() => onThreadChange(!isThread)}
              tooltip={
                isThread ? 'Generate as thread' : 'Generate individual posts'
              }
              tooltipPosition="top"
              variant={
                isThread ? ButtonVariant.DEFAULT : ButtonVariant.SECONDARY
              }
              className="h-9 px-3 text-sm"
              icon={<List className="size-4" />}
              isDisabled={isEnhancing}
            >
              Thread
            </Button>
          )}
          <Button
            variant={ButtonVariant.DEFAULT}
            icon={<ArrowUp />}
            label={buttonLabel}
            tooltip={buttonLabel}
            isLoading={isEnhancing}
            isDisabled={isSubmitDisabled}
            onClick={onSubmit}
            type="submit"
            className="h-9 px-3.5"
          />
        </div>
      </form>
    </>
  );
}
