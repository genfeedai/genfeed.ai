import type { TweetTone } from '@ui/posts/enhancement-bar/PostEnhancementBar.props';
import { Languages, Minimize2, Rocket } from 'lucide-react';

export const QUICK_ACTIONS = [
  {
    icon: Minimize2,
    key: 'shorten' as const,
    label: 'Shorten',
    prompt:
      'Make this content shorter and more concise while keeping the key message',
    tooltip: 'Shorten content (1 credit)',
  },
  {
    icon: Languages,
    key: 'simplify' as const,
    label: 'Simplify',
    prompt: 'Simplify the language to make it easier to understand',
    tooltip: 'Simplify language (1 credit)',
  },
  {
    icon: Rocket,
    key: 'boost' as const,
    label: 'Boost',
    prompt:
      'Make this post more engaging and optimized for social media. Add compelling hooks, clear value proposition, and strong call-to-action. Keep it concise and shareable.',
    tooltip: 'Boost post for social media (1 credit)',
  },
] as const;

export const TONE_OPTIONS: { key: TweetTone; label: string }[] = [
  { key: 'professional', label: 'Professional' },
  { key: 'casual', label: 'Casual' },
  { key: 'viral', label: 'Viral' },
  { key: 'educational', label: 'Educational' },
  { key: 'humorous', label: 'Humorous' },
];
