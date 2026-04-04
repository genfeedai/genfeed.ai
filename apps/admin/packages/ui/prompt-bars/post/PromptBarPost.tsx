'use client';

import { ButtonSize, ButtonVariant, Platform } from '@genfeedai/enums';
import { PLATFORM_LABEL_MAP } from '@helpers/content/posts.helper';
import { cn } from '@helpers/formatting/cn/cn.util';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import type { PromptBarContentProps } from '@props/prompt-bars/prompt-bar-content.props';
import Button from '@ui/buttons/base/Button';
import FormInput from '@ui/forms/inputs/input/form-input/FormInput';
import FormTextarea from '@ui/forms/inputs/textarea/form-textarea/FormTextarea';
import FormDropdown from '@ui/forms/selectors/dropdown/form-dropdown/FormDropdown';
import PromptBarDivider from '@ui/prompt-bars/components/divider/PromptBarDivider';
import PromptBarShell from '@ui/prompt-bars/components/shell/PromptBarShell';
import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiArrowUp,
  HiBookmark,
  HiChevronUp,
  HiQueueList,
  HiSquares2X2,
  HiSquaresPlus,
} from 'react-icons/hi2';

const CONTROL_CLASS =
  'h-9 rounded-lg px-3 gap-2 text-sm flex-shrink-0 !border-white/10 !bg-white/[0.03] text-white/80 hover:!bg-white/[0.06] hover:text-white';
const COLLAPSE_BUTTON_CLASS =
  'h-8 w-8 rounded-full border border-white/10 bg-black/20 p-0 text-white/70 backdrop-blur-sm hover:bg-black/30 hover:text-white';

function PromptBarPost({
  onSubmit,
  isEnhancing,
  showCountDropdown = false,
  showThreadToggle = false,
  buttonLabel = 'Enhance',
  platform = 'all',
  onPlatformChange,
  availablePlatforms = [
    Platform.YOUTUBE,
    Platform.INSTAGRAM,
    Platform.TWITTER,
    Platform.TIKTOK,
  ],
  presets = [],
}: PromptBarContentProps) {
  const [prompt, setPrompt] = useState('');
  const [count, setCount] = useState(3);
  const [isThread, setIsThread] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedPresetKey, setSelectedPresetKey] = useState('');
  const prevIsEnhancingRef = useRef(isEnhancing);
  const prevPlatformRef = useRef(platform);

  useEffect(() => {
    if (prevPlatformRef.current !== platform) {
      if (platform !== Platform.TWITTER) {
        setIsThread(false);
      }
      prevPlatformRef.current = platform;
    }
  }, [platform]);

  const platformOptions = useMemo(
    () =>
      availablePlatforms.map((currentPlatform: Platform) => ({
        icon: getPlatformIcon(currentPlatform),
        key: currentPlatform,
        label: PLATFORM_LABEL_MAP[currentPlatform],
      })),
    [availablePlatforms],
  );

  const promptPlaceholder = useMemo(() => {
    if (!showCountDropdown) {
      return 'Describe how you want to enhance your post...';
    }

    const platformPlaceholders: Record<Platform | 'all', string> = {
      all: 'e.g., AI productivity tips, startup advice, tech trends...',
      [Platform.TWITTER]:
        'e.g., viral tweet ideas, trending topics, quick tips...',
      [Platform.INSTAGRAM]:
        'e.g., visual content ideas, story concepts, captions...',
      [Platform.YOUTUBE]:
        'e.g., video topics, tutorial ideas, content series...',
      [Platform.TIKTOK]:
        'e.g., trending challenges, short-form content, viral ideas...',
      [Platform.FACEBOOK]:
        'e.g., community posts, engagement content, updates...',
      [Platform.LINKEDIN]:
        'e.g., professional insights, industry thoughts, career tips...',
      [Platform.PINTEREST]:
        'e.g., pin ideas, visual inspiration, DIY projects...',
      [Platform.REDDIT]:
        'e.g., discussion topics, AMA questions, community posts...',
      [Platform.DISCORD]:
        'e.g., community announcements, discussion prompts...',
      [Platform.TELEGRAM]: 'e.g., channel updates, news sharing, tips...',
      [Platform.THREADS]:
        'e.g., conversational threads, community discussions...',
      [Platform.TWITCH]:
        'e.g., stream topics, gaming content, community engagement...',
      [Platform.MEDIUM]:
        'e.g., article topics, deep dives, thought leadership...',
      [Platform.FANVUE]:
        'e.g., exclusive creator content, fan engagement, premium posts...',
      [Platform.SLACK]:
        'e.g., team updates, announcements, workspace discussions...',
      [Platform.WORDPRESS]:
        'e.g., blog posts, tutorials, long-form articles...',
      [Platform.SNAPCHAT]:
        'e.g., snap stories, visual content, quick updates...',
      [Platform.WHATSAPP]:
        'e.g., broadcast messages, status updates, group content...',
      [Platform.MASTODON]:
        'e.g., community posts, federated discussions, toots...',
      [Platform.GHOST]:
        'e.g., newsletter content, blog articles, member posts...',
      [Platform.SHOPIFY]:
        'e.g., product descriptions, store updates, promotions...',
      [Platform.BEEHIIV]:
        'e.g., newsletter topics, subscriber updates, curated content...',
      [Platform.GOOGLE_ADS]:
        'e.g., ad copy, campaign ideas, keyword strategies...',
    };

    return (
      platformPlaceholders[platform as Platform | 'all'] ||
      platformPlaceholders.all
    );
  }, [platform, showCountDropdown]);

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
      presets.map(
        (preset: { key: string; label: string; description: string }) => ({
          key: preset.key,
          label: preset.label,
        }),
      ),
    [presets],
  );

  const handlePresetChange = (value: string) => {
    setSelectedPresetKey(value);
    const preset = presets.find((currentPreset) => currentPreset.key === value);
    if (preset) {
      setPrompt(preset.description);
    }
  };

  useEffect(() => {
    if (prevIsEnhancingRef.current && !isEnhancing) {
      setPrompt('');
    }
    prevIsEnhancingRef.current = isEnhancing;
  }, [isEnhancing]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (prompt.trim() && !isEnhancing) {
      const selectedPlatform =
        platform === 'all' ? undefined : (platform as Platform);

      await onSubmit(
        prompt.trim(),
        showCountDropdown ? count : undefined,
        selectedPlatform,
        showThreadToggle ? isThread : undefined,
      );
    }
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event as unknown as FormEvent);
    }
  };

  return (
    <PromptBarShell
      className={cn(
        'flex flex-col transition-all duration-300',
        isCollapsed ? 'overflow-hidden p-2' : 'overflow-visible p-2',
      )}
    >
      {isCollapsed ? (
        <div className="flex items-center gap-2">
          {presetOptions.length > 0 && (
            <FormDropdown
              name="preset"
              icon={<HiBookmark />}
              label="Preset"
              value={selectedPresetKey}
              isFullWidth={false}
              isNoneEnabled={true}
              dropdownDirection="up"
              className={CONTROL_CLASS}
              options={presetOptions}
              isDisabled={isEnhancing}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                handlePresetChange(event.target.value)
              }
            />
          )}

          <FormInput
            name="prompt"
            type="text"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={promptPlaceholder}
            isDisabled={isEnhancing}
            className="h-9 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm text-white/90 focus:border-white/20 focus:outline-none"
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
                    className="h-9 rounded-lg px-3"
                    tooltip="Outputs"
                    tooltipPosition="left"
                    icon={<HiSquaresPlus className="w-4 h-4" />}
                    onClick={() => {
                      const countCycle: Record<number, number> = {
                        1: 2,
                        2: 3,
                        3: 5,
                        5: 10,
                        10: 1,
                      };
                      setCount(countCycle[count] ?? 1);
                    }}
                    isDisabled={isEnhancing}
                  />
                )}
                {showThreadToggle && platform === Platform.TWITTER && (
                  <Button
                    onClick={() => setIsThread(!isThread)}
                    tooltip={isThread ? 'Thread mode' : 'Individual posts'}
                    tooltipPosition="top"
                    variant={
                      isThread ? ButtonVariant.DEFAULT : ButtonVariant.SECONDARY
                    }
                    className="h-9 w-9 rounded-lg p-0"
                    icon={<HiQueueList className="w-4 h-4" />}
                    isDisabled={isEnhancing}
                  />
                )}
              </div>
            </>
          )}

          <PromptBarDivider className="h-5 bg-white/10" />

          <div className="flex items-center gap-2">
            <Button
              variant={ButtonVariant.GENERATE}
              icon={<HiArrowUp />}
              label={buttonLabel}
              tooltip={buttonLabel}
              isLoading={isEnhancing}
              isDisabled={!prompt.trim()}
              onClick={handleSubmit}
              className="h-9 rounded-xl px-3.5"
            />
            <Button
              onClick={() => setIsCollapsed(false)}
              tooltip="Expand prompt bar"
              tooltipPosition="top"
              variant={ButtonVariant.GHOST}
              className={COLLAPSE_BUTTON_CLASS}
              icon={<HiChevronUp className="w-4 h-4" />}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {onPlatformChange && (
                <FormDropdown
                  name="platform"
                  icon={
                    platform === 'all' ? (
                      <HiSquares2X2 />
                    ) : (
                      getPlatformIcon(platform as Platform)
                    )
                  }
                  label={PLATFORM_LABEL_MAP[platform as Platform]}
                  isFullWidth={false}
                  dropdownDirection="up"
                  className={CONTROL_CLASS}
                  value={platform}
                  options={platformOptions}
                  isNoneEnabled={false}
                  isDisabled={isEnhancing}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                    const newPlatform = event.target.value as Platform | 'all';
                    onPlatformChange(newPlatform);
                  }}
                />
              )}

              {presetOptions.length > 0 && (
                <FormDropdown
                  name="preset"
                  icon={<HiBookmark />}
                  label="Preset"
                  value={selectedPresetKey}
                  isFullWidth={false}
                  isNoneEnabled={true}
                  dropdownDirection="up"
                  className={CONTROL_CLASS}
                  options={presetOptions}
                  isDisabled={isEnhancing}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                    handlePresetChange(event.target.value)
                  }
                />
              )}
            </div>

            <Button
              onClick={() => setIsCollapsed(true)}
              tooltip="Collapse"
              tooltipPosition="top"
              variant={ButtonVariant.GHOST}
              className={COLLAPSE_BUTTON_CLASS}
              icon={
                <HiChevronUp
                  className="rotate-180 transition-transform"
                  size={16}
                />
              }
            />
          </div>

          <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2">
            <FormTextarea
              name="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={promptPlaceholder}
              isDisabled={isEnhancing}
              className="min-h-[96px] w-full resize-none rounded-2xl border border-white/10 bg-transparent px-2 py-2 text-sm text-white/90 shadow-none focus:border-transparent focus-visible:ring-0"
            />

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/8 pt-2">
              {showCountDropdown && (
                <FormDropdown
                  name="count"
                  icon={<HiSquaresPlus />}
                  label="Posts"
                  isFullWidth={false}
                  dropdownDirection="up"
                  className={CONTROL_CLASS}
                  value={String(count)}
                  options={[
                    { key: '1', label: '1x' },
                    { key: '2', label: '2x' },
                    { key: '3', label: '3x' },
                    { key: '5', label: '5x' },
                    { key: '10', label: '10x' },
                  ]}
                  isNoneEnabled={false}
                  isDisabled={isEnhancing}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                    setCount(Number(event.target.value));
                  }}
                />
              )}
              {showThreadToggle && platform === Platform.TWITTER && (
                <Button
                  onClick={() => setIsThread(!isThread)}
                  tooltip={
                    isThread
                      ? 'Generate as thread'
                      : 'Generate individual posts'
                  }
                  tooltipPosition="top"
                  variant={
                    isThread ? ButtonVariant.DEFAULT : ButtonVariant.SECONDARY
                  }
                  className="h-9 rounded-lg px-3 text-sm"
                  icon={<HiQueueList className="w-4 h-4" />}
                  isDisabled={isEnhancing}
                >
                  Thread
                </Button>
              )}
              <Button
                variant={ButtonVariant.GENERATE}
                icon={<HiArrowUp />}
                label={buttonLabel}
                tooltip={buttonLabel}
                isLoading={isEnhancing}
                isDisabled={!prompt.trim()}
                onClick={handleSubmit}
                type="submit"
                className="h-9 rounded-xl px-3.5"
              />
            </div>
          </form>
        </>
      )}
    </PromptBarShell>
  );
}

export default memo(PromptBarPost);
