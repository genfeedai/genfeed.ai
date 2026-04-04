import type { PostQuickActionKey } from '@ui/posts/quick-actions/post-quick-actions/PostQuickActions';

export interface PostQuickActionsProps {
  postId: string;
  onEnhance: (
    postId: string,
    prompt: string,
    actionKey: PostQuickActionKey,
  ) => Promise<void>;
  isEnhancing: boolean;
  enhancingAction: PostQuickActionKey | null;
  hasContent?: boolean;
  className?: string;
  orgId?: string;
  token?: string;
  content?: string;
  onAiResult?: (action: string, result: string) => void;
}
