import type {
  PostComposerPresetKey,
  TweetTone,
} from '@ui/posts/composer-prompt-bar/PostComposerPromptBar.props';
import type { LucideIcon } from 'lucide-react';
import {
  AtSign,
  Hash,
  Languages,
  ListPlus,
  MessageSquarePlus,
  Minimize2,
  Rocket,
  Sparkles,
} from 'lucide-react';

export interface PostComposerPreset {
  key: PostComposerPresetKey;
  label: string;
  icon: LucideIcon;
  /** Rewrite instruction; absent for presets that act on the thread. */
  prompt?: (platformLabel: string) => string;
}

export const REWRITE_PRESETS: PostComposerPreset[] = [
  {
    icon: Minimize2,
    key: 'shorten',
    label: 'Shorten',
    prompt: () =>
      'Make this content shorter and more concise while keeping the key message',
  },
  {
    icon: Languages,
    key: 'simplify',
    label: 'Simplify',
    prompt: () => 'Simplify the language to make it easier to understand',
  },
  {
    icon: Rocket,
    key: 'boost',
    label: 'Boost',
    prompt: () =>
      'Make this post more engaging and optimized for social media. Add compelling hooks, clear value proposition, and strong call-to-action. Keep it concise and shareable.',
  },
  {
    icon: Hash,
    key: 'hashtags',
    label: 'Hashtags',
    prompt: (platformLabel) =>
      `Add 3 to 5 relevant ${platformLabel} hashtags at the end. Keep the rest of the text unchanged.`,
  },
  {
    icon: Sparkles,
    key: 'caption',
    label: 'Optimize caption',
    prompt: (platformLabel) =>
      `Optimize this caption for ${platformLabel}: a strong first line, clear value and one call to action.`,
  },
];

export const THREAD_PRESETS: Record<
  'thread' | 'grok' | 'comment',
  PostComposerPreset
> = {
  comment: {
    icon: MessageSquarePlus,
    key: 'comment',
    label: 'Add first comment',
  },
  grok: { icon: AtSign, key: 'grok', label: 'End with @grok' },
  thread: { icon: ListPlus, key: 'thread', label: 'Turn into a thread' },
};

export const QUICK_ACTION_KEYS = new Set<PostComposerPresetKey>([
  'shorten',
  'simplify',
  'boost',
]);

export const TONE_OPTIONS: { key: TweetTone; label: string }[] = [
  { key: 'professional', label: 'Professional' },
  { key: 'casual', label: 'Casual' },
  { key: 'viral', label: 'Viral' },
  { key: 'educational', label: 'Educational' },
  { key: 'humorous', label: 'Humorous' },
];
