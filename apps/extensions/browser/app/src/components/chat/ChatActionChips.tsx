import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';

import { usePlatformStore } from '~store/use-platform-store';

interface ChatActionChipsProps {
  onChipClick: (prompt: string) => void;
}

interface ActionChip {
  label: string;
  prompt: string;
}

const PLATFORM_CHIPS: Record<string, ActionChip[]> = {
  facebook: [
    { label: 'Write post', prompt: 'Write a Facebook post about' },
    { label: 'Comment', prompt: 'Write a comment on this post' },
  ],
  instagram: [
    { label: 'Caption', prompt: 'Write an Instagram caption for' },
    { label: 'Hashtags', prompt: 'Generate relevant Instagram hashtags for' },
  ],
  linkedin: [
    { label: 'Write post', prompt: 'Write a LinkedIn post about' },
    { label: 'Comment', prompt: 'Write a professional comment on this post' },
    {
      label: 'Article intro',
      prompt: 'Write a LinkedIn article introduction about',
    },
  ],
  reddit: [
    { label: 'Comment', prompt: 'Write a Reddit comment on this post' },
    { label: 'Write post', prompt: 'Write a Reddit post about' },
  ],
  tiktok: [
    { label: 'Caption', prompt: 'Write a TikTok caption for' },
    {
      label: 'Trending hashtags',
      prompt: 'Generate trending TikTok hashtags for',
    },
  ],
  twitter: [
    { label: 'Write tweet', prompt: 'Write a tweet about' },
    { label: 'Reply', prompt: 'Write a reply to this post' },
    { label: 'Thread', prompt: 'Create a tweet thread about' },
    { label: 'Improve draft', prompt: 'Improve this draft tweet' },
  ],
  youtube: [
    { label: 'Description', prompt: 'Write a YouTube video description about' },
    { label: 'Comment', prompt: 'Write a YouTube comment on this video' },
  ],
};

const DEFAULT_CHIPS: ActionChip[] = [
  { label: 'Write content', prompt: 'Write social media content about' },
  { label: 'Improve text', prompt: 'Improve this text:' },
];

export function ChatActionChips({
  onChipClick,
}: ChatActionChipsProps): ReactElement {
  const currentPlatform = usePlatformStore((s) => s.currentPlatform);
  const chips =
    (currentPlatform && PLATFORM_CHIPS[currentPlatform]) || DEFAULT_CHIPS;

  return (
    <div className="flex gap-1.5 overflow-x-auto px-3 pt-2 pb-1 scrollbar-none">
      {chips.map((chip) => (
        <Button
          key={chip.label}
          type="button"
          variant={ButtonVariant.SECONDARY}
          onClick={() => onChipClick(chip.prompt)}
          className="shrink-0 rounded-full px-3 py-1 text-xs"
        >
          {chip.label}
        </Button>
      ))}
    </div>
  );
}
