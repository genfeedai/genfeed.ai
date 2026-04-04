import type { IIngredient, IPost } from '@genfeedai/interfaces';
import type { CredentialPlatform } from '@genfeedai/enums';
import type { PostsService } from '@services/content/posts.service';
import type { NotificationsService } from '@services/core/notifications.service';
import type { PostQuickActionKey } from '@ui/posts/quick-actions/post-quick-actions/PostQuickActions';
import type { PageScope } from '@ui-constants/misc.constant';
import type { MutableRefObject } from 'react';

export interface PostDetailCardProps {
  post: IPost;
  /** Position in thread (0 for parent, 1+ for children). isParent is derived from index === 0 internally */
  index: number;
  scope: PageScope;
  platform: CredentialPlatform;
  isDraggable?: boolean;
  focusedPostId: string | null;
  setFocusedPostId: (postId: string | null) => void;
  descriptionValue: string;
  onDescriptionChange: (value: string) => void;
  /** For parent posts on non-Twitter platforms */
  labelValue?: string;
  onLabelChange?: (value: string) => void;
  selectedMedia: IIngredient[];
  carouselValidation?: {
    valid: boolean;
    errors: string[];
  };
  publishedDisplay?: string;
  showAnalytics?: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  getPostsService: () => Promise<PostsService>;
  onUpdateChild: (childId: string, updates: Partial<IPost>) => void;
  notificationsService: NotificationsService;
  /** Twitter only */
  canAddThread?: boolean;
  onAddToThread?: () => void;
  isLast?: boolean;
  /** Only for children */
  onDeleteChild?: (childId: string) => void;
  onQuickAction?: (
    postId: string,
    prompt: string,
    actionKey: PostQuickActionKey,
  ) => Promise<void>;
  onPromptEnhance?: (postId: string, prompt: string) => Promise<void>;
  enhancingPostId?: string | null;
  enhancingAction?: PostQuickActionKey | null;
  performAutoSaveForPost?: (postId: string) => Promise<void>;
  currentDescriptionsRef: MutableRefObject<Map<string, string>>;
  currentLabelsRef: MutableRefObject<Map<string, string>>;
  lastSavedDescriptionsRef: MutableRefObject<Map<string, string>>;
  lastSavedLabelsRef: MutableRefObject<Map<string, string>>;
  autoSaveTimeoutsRef: MutableRefObject<Map<string, NodeJS.Timeout>>;
  onGenerateIllustration?: (postId: string, prompt: string) => void;
  onSelectMedia?: (postId: string, currentIngredients: IIngredient[]) => void;
  isSavingMedia?: boolean;
  onSave?: () => void;
  isDirty?: boolean;
  isSaving?: boolean;
}
