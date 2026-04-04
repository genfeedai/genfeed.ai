import type { IIngredient } from '@genfeedai/interfaces';
import type { PostQuickActionKey } from '@ui/posts/quick-actions/post-quick-actions/PostQuickActions';

export type TweetTone =
  | 'professional'
  | 'casual'
  | 'viral'
  | 'educational'
  | 'humorous';

export interface PostEnhancementBarProps {
  /**
   * The post ID to enhance
   */
  postId: string;
  /**
   * Handler called when a quick action is triggered
   */
  onQuickAction: (
    postId: string,
    prompt: string,
    actionKey: PostQuickActionKey,
    tone?: TweetTone,
  ) => Promise<void>;
  /**
   * Handler called when user submits a custom enhancement prompt
   */
  onPromptEnhance: (
    postId: string,
    prompt: string,
    tone?: TweetTone,
  ) => Promise<void>;
  /**
   * Selected tone for enhancement
   */
  selectedTone?: TweetTone;
  /**
   * Handler called when tone is changed
   */
  onToneChange?: (tone: TweetTone) => void;
  /**
   * Whether any enhancement is currently in progress for this post
   */
  isEnhancing: boolean;
  /**
   * The currently active action key (if enhancing)
   */
  enhancingAction: PostQuickActionKey | null;
  /**
   * Whether the post has content to enhance
   */
  hasContent?: boolean;
  /**
   * Placeholder text for the input
   */
  placeholder?: string;
  /**
   * Additional CSS classes
   */
  className?: string;
  /**
   * Media selection handler
   */
  onSelectMedia?: () => void;
  /**
   * Generate illustration handler
   */
  onGenerateIllustration?: () => void;
  /**
   * Selected media ingredients
   */
  selectedMedia?: IIngredient[];
  /**
   * Whether media is being saved
   */
  isSavingMedia?: boolean;
  /**
   * Save handler
   */
  onSave?: () => void;
  /**
   * Whether content is dirty (needs saving)
   */
  isDirty?: boolean;
  /**
   * Whether save is in progress
   */
  isSaving?: boolean;
  /**
   * Add post handler (for thread)
   */
  onAddPost?: () => void;
  /**
   * Whether to show add post button
   */
  showAddPost?: boolean;
  /**
   * Delete handler
   */
  onDelete?: () => void;
  /**
   * Whether to show delete button
   */
  showDelete?: boolean;
  /**
   * Post content for AI generators (hashtag/caption)
   */
  postContent?: string;
  /**
   * Platform string for AI generators
   */
  postPlatform?: string;
  /**
   * Handler when a hashtag is inserted via the generator
   */
  onInsertHashtag?: (hashtag: string) => void;
  /**
   * Handler when an optimized caption is accepted
   */
  onAcceptCaption?: (caption: string) => void;
}
