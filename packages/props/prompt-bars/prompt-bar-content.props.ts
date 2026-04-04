import type { IPreset } from '@cloud/interfaces';
import type { Platform } from '@genfeedai/enums';

/**
 * Props for content enhancement prompt bars (Post, Article, etc.)
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
}
