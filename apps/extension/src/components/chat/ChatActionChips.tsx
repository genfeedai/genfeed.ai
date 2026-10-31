import { ButtonVariant } from '@genfeedai/contracts';
import type { TextActionMode } from '@genfeedai/contracts/interfaces';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';

import { usePlatformStore } from '~store/use-platform-store';

interface ChatActionChipsProps {
  onChipClick: (prompt: string) => void;
  /** Proofread or rewrite the draft in the page's composer. */
  onTextAction: (mode: TextActionMode) => void;
}

const TEXT_ACTION_CHIPS: { label: string; mode: TextActionMode }[] = [
  { label: 'Proofread', mode: 'proofread' },
  { label: 'Rewrite in my voice', mode: 'rewrite' },
];

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
  ],
  youtube: [
    { label: 'Description', prompt: 'Write a YouTube video description about' },
    { label: 'Comment', prompt: 'Write a YouTube comment on this video' },
  ],
};

const DEFAULT_CHIPS: ActionChip[] = [
  { label: 'Write content', prompt: 'Write social media content about' },
];

export function ChatActionChips({
  onChipClick,
  onTextAction,
}: ChatActionChipsProps): ReactElement {
  const currentPlatform = usePlatformStore((s) => s.currentPlatform);
  const chips =
    (currentPlatform && PLATFORM_CHIPS[currentPlatform]) || DEFAULT_CHIPS;

  return (
    <div className="flex flex-wrap gap-2">
      {TEXT_ACTION_CHIPS.map((chip) => (
        <Button
          key={chip.mode}
          type="button"
          variant={ButtonVariant.SECONDARY}
          onClick={() => onTextAction(chip.mode)}
          className="shrink-0 rounded-lg px-3 py-1.5 text-xs"
        >
          {chip.label}
        </Button>
      ))}
      {chips.map((chip) => (
        <Button
          key={chip.label}
          type="button"
          variant={ButtonVariant.SECONDARY}
          onClick={() => onChipClick(chip.prompt)}
          className="shrink-0 rounded-lg px-3 py-1.5 text-xs"
        >
          {chip.label}
        </Button>
      ))}
    </div>
  );
}
