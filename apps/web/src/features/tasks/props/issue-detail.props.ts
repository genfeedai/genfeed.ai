import type { TaskCommentsService } from '@services/management/task-comments.service';

/** Builds the comments service for one task from the same auth token. */
export type TaskCommentsServiceFactory = (
  taskId: string,
) => TaskCommentsService;

export interface IssueDetailState {
  commentBody: string;
  isSubmitting: boolean;
  showAllComments: boolean;
}

export type IssueDetailAction =
  | { type: 'SET_COMMENT_BODY'; payload: string }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_END' }
  | { type: 'SHOW_ALL_COMMENTS' };

export interface IssueDetailProps {
  issueId: string;
  /** If true, treat issueId as a human-readable identifier (e.g., GEN-42) */
  useIdentifier?: boolean;
}
