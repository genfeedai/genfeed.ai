'use client';

import { Platform } from '@genfeedai/enums';
import {
  isPostPlatform,
  PLATFORM_LABEL_MAP,
  type PostPlatform,
} from '@genfeedai/helpers/content/posts.helper';
import { getPlatformIcon } from '@genfeedai/helpers/ui/platform-icon/platform-icon.helper';
import { usePromptBarSubmission } from '@genfeedai/hooks/prompt-bar/use-prompt-bar-submission/use-prompt-bar-submission';
import type {
  PromptBarContentProps,
  PromptBarPlatformOption,
  PromptBarPresetOption,
} from '@genfeedai/props/prompt-bars/prompt-bar-content.props';
import {
  DEFAULT_PLATFORMS,
  resolvePromptBarContentPlaceholder,
} from '@ui/prompt-bars/content/prompt-bar-content.helpers';
import { useCallback, useMemo, useState } from 'react';

const EMPTY_ARRAY: never[] = [];

/**
 * Single controller behind every content prompt bar. Submission lifecycle is
 * delegated to `usePromptBarSubmission`; this hook only owns the surface state
 * (presets, platform, count, thread, collapsed) layered on top of it.
 */
export function usePromptBarContent({
  onSubmit,
  isEnhancing,
  showCountDropdown = false,
  showThreadToggle = false,
  buttonLabel = 'Enhance',
  platform = 'all',
  onPlatformChange,
  availablePlatforms = DEFAULT_PLATFORMS,
  presets = EMPTY_ARRAY,
  placeholder,
}: PromptBarContentProps) {
  const [count, setCount] = useState(3);
  const [isThread, setIsThread] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedPresetKeyState, setSelectedPresetKey] = useState('');

  const effectiveIsThread = platform === Platform.TWITTER ? isThread : false;

  const handlePromptSubmit = useCallback(
    async (trimmedPrompt: string): Promise<void> => {
      // Only forward an actual post-capable platform; non-posting platforms
      // (e.g. Google Search Console) are treated as no specific platform.
      const selectedPlatform =
        platform !== 'all' && isPostPlatform(platform) ? platform : undefined;

      await onSubmit(
        trimmedPrompt,
        showCountDropdown ? count : undefined,
        selectedPlatform,
        showThreadToggle ? effectiveIsThread : undefined,
      );
    },
    [
      count,
      effectiveIsThread,
      onSubmit,
      platform,
      showCountDropdown,
      showThreadToggle,
    ],
  );

  const { handleKeyDown, handleSubmit, isSubmitDisabled, prompt, setPrompt } =
    usePromptBarSubmission({ isEnhancing, onSubmit: handlePromptSubmit });

  const platformOptions = useMemo<PromptBarPlatformOption[]>(
    () =>
      availablePlatforms
        .filter(isPostPlatform)
        .map((currentPlatform: PostPlatform) => ({
          icon: getPlatformIcon(currentPlatform),
          key: currentPlatform,
          label: PLATFORM_LABEL_MAP[currentPlatform],
        })),
    [availablePlatforms],
  );

  const promptPlaceholder = useMemo(
    () =>
      resolvePromptBarContentPlaceholder({
        isGenerating: showCountDropdown,
        placeholder,
        platform,
      }),
    [placeholder, platform, showCountDropdown],
  );

  // A preset removed between renders must not stay selected in the dropdown.
  const selectedPresetKey = presets.some(
    (preset) => preset.key === selectedPresetKeyState,
  )
    ? selectedPresetKeyState
    : '';

  const presetOptions = useMemo<PromptBarPresetOption[]>(
    () =>
      presets.map((preset) => ({
        key: preset.key,
        label: preset.label,
      })),
    [presets],
  );

  const handlePresetChange = useCallback(
    (value: string): void => {
      setSelectedPresetKey(value);
      const preset = presets.find(
        (currentPreset) => currentPreset.key === value,
      );
      if (preset) {
        setPrompt(preset.description);
      }
    },
    [presets, setPrompt],
  );

  return {
    buttonLabel,
    count,
    handleKeyDown,
    handlePresetChange,
    handleSubmit,
    isCollapsed,
    isEnhancing,
    isSubmitDisabled,
    isThread: effectiveIsThread,
    onPlatformChange,
    platform,
    platformOptions,
    presetOptions,
    prompt,
    promptPlaceholder,
    selectedPresetKey,
    setCount,
    setIsCollapsed,
    setIsThread,
    setPrompt,
    showCountDropdown,
    showThreadToggle,
  };
}
