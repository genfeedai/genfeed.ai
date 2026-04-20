export type PostQuickActionKey = 'shorten' | 'simplify' | 'boost';

export interface PostQuickActionDefinition {
  key: PostQuickActionKey;
  label: string;
  prompt: string;
}
