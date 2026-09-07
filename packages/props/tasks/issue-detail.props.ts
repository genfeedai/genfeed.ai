import type { TaskComment } from '@services/management/task-comments.service';
import type { Task } from '@services/management/tasks.service';

export interface IssueDetailState {
  issue: Task | null;
  comments: TaskComment[];
  children: Task[];
  isLoading: boolean;
  commentBody: string;
  isSubmitting: boolean;
  showAllComments: boolean;
}

export type IssueDetailAction =
  | { type: 'LOAD_START' }
  | {
      type: 'LOAD_SUCCESS';
      payload: { issue: Task; comments: TaskComment[]; children: Task[] };
    }
  | { type: 'LOAD_ERROR' }
  | { type: 'LOAD_DONE' }
  | { type: 'SET_ISSUE'; payload: Task }
  | { type: 'APPEND_COMMENT'; payload: TaskComment }
  | { type: 'SET_COMMENT_BODY'; payload: string }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_END' }
  | { type: 'SHOW_ALL_COMMENTS' };

export interface IssueDetailProps {
  issueId: string;
  /** If true, treat issueId as a human-readable identifier (e.g., GEN-42) */
  useIdentifier?: boolean;
}
