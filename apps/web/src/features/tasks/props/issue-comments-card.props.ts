import type { TaskComment } from '@services/management/task-comments.service';
import type { RefObject } from 'react';

export type IssueCommentsCardProps = {
  comments: TaskComment[];
  visibleComments: TaskComment[];
  hiddenCommentCount: number;
  showAllComments: boolean;
  commentBody: string;
  isSubmitting: boolean;
  lastCommentRef: RefObject<HTMLDivElement | null>;
  visibleCommentCount: number;
  onShowAllComments: () => void;
  onScrollToLatest: () => void;
  onCommentBodyChange: (value: string) => void;
  onAddComment: () => Promise<void>;
};
