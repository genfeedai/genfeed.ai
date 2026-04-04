export interface HashtagGeneratorButtonProps {
  /** Current post content to generate hashtags from */
  content: string;
  /** Platform for context-specific hashtags */
  platform: string;
  /** Callback when user selects a hashtag to insert */
  onInsert: (hashtag: string) => void;
  /** Optional: number of hashtags to generate */
  count?: number;
  /** Optional: niche/topic for better results */
  niche?: string;
  /** Whether the button should be disabled */
  isDisabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export interface CaptionGeneratorButtonProps {
  /** Current post content to optimize */
  content: string;
  /** Platform for context-specific optimization */
  platform?: string;
  /** Content type for the optimizer */
  contentType?: 'caption' | 'video' | 'image' | 'article' | 'script';
  /** Callback when user accepts the generated caption */
  onAccept: (caption: string) => void;
  /** Whether the button should be disabled */
  isDisabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}
