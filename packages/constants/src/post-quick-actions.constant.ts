export type PostQuickActionKey = 'shorten' | 'simplify' | 'boost';

export interface PostQuickActionDefinition {
  key: PostQuickActionKey;
  label: string;
  prompt: string;
}

export const POST_QUICK_ACTIONS = [
  {
    key: 'shorten',
    label: 'Shorten',
    prompt:
      'Make this content shorter and more concise while keeping the key message',
  },
  {
    key: 'simplify',
    label: 'Simplify',
    prompt: 'Simplify the language to make it easier to understand',
  },
  {
    key: 'boost',
    label: 'Boost',
    prompt:
      'Make this post more engaging and optimized for social media. Add compelling hooks, clear value proposition, and strong call-to-action. Keep it concise and shareable.',
  },
] as const satisfies readonly PostQuickActionDefinition[];
