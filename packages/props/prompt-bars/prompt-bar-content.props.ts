import type { Platform } from '@genfeedai/enums';
import type { IPreset } from '@genfeedai/interfaces';
import type { KeyboardEvent, ReactNode, SyntheticEvent } from 'react';

/**
 * One component serves every content surface; capabilities are opt-in props.
 */
export interface PromptBarContentProps {
  onSubmit: (
    prompt: string,
    count?: number,
    platform?: Platform,
    isThread?: boolean,
  ) => Promise<void> | void;
  isEnhancing: boolean;
  /** Optional: Show count dropdown for generation (e.g., generate 2, 4, 10 posts) */
  showCountDropdown?: boolean;
  /** Optional: Show thread toggle for generating cohesive threads */
  showThreadToggle?: boolean;
  /** Optional: Button label (default: "Enhance") */
  buttonLabel?: string;
  /** Current selected platform */
  platform?: Platform | 'all';
  /** Callback when platform changes */
  onPlatformChange?: (platform: Platform | 'all') => void;
  /** Available platforms for selection */
  availablePlatforms?: Platform[];
  /** Optional presets for quick-fill prompts */
  presets?: Pick<IPreset, 'key' | 'label' | 'description'>[];
  /** Optional: override the resolved placeholder copy */
  placeholder?: string;
}

export interface PromptBarPresetOption {
  key: string;
  label: string;
}

export interface PromptBarPlatformOption {
  icon: ReactNode;
  key: Platform;
  label: string;
}

/** Shared surface for the collapsed and expanded content prompt-bar views. */
export interface PromptBarContentViewProps {
  buttonLabel: string;
  count: number;
  isEnhancing: boolean;
  isSubmitDisabled: boolean;
  isThread: boolean;
  platform: Platform | 'all';
  presetOptions: PromptBarPresetOption[];
  prompt: string;
  promptPlaceholder: string;
  selectedPresetKey: string;
  showCountDropdown: boolean;
  showThreadToggle: boolean;
  onCountChange: (count: number) => void;
  onKeyDown: (
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  onPresetChange: (value: string) => void;
  onPromptChange: (value: string) => void;
  onSubmit: (event: SyntheticEvent) => void;
  onThreadChange: (value: boolean) => void;
}

export interface PromptBarContentExpandedViewProps
  extends PromptBarContentViewProps {
  platformOptions: PromptBarPlatformOption[];
  onCollapse: () => void;
  onPlatformChange?: (platform: Platform | 'all') => void;
}

export interface PromptBarContentCollapsedViewProps
  extends PromptBarContentViewProps {
  onExpand: () => void;
}

/**
 * Every content prompt bar routes its submit through this contract.
 */
export interface UsePromptBarSubmissionOptions {
  isEnhancing: boolean;
  onSubmit: (prompt: string) => Promise<void> | void;
}

export interface UsePromptBarSubmissionReturn {
  handleKeyDown: (
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  handleSubmit: (event?: SyntheticEvent) => Promise<void>;
  isSubmitDisabled: boolean;
  prompt: string;
  setPrompt: (value: string) => void;
}
