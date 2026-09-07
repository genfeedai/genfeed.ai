import type { ViewType } from '@genfeedai/contracts';
import type { Task, TaskPriority } from '@services/management/tasks.service';

export type ViewMode = ViewType.KANBAN | ViewType.LIST;

export type IssuesListState = {
  issues: Task[];
  isLoading: boolean;
  showCreateDialog: boolean;
  createTitle: string;
  createDescription: string;
  createPriority: TaskPriority;
  isCreating: boolean;
};

export type IssuesListAction =
  | { type: 'SET_ISSUES'; payload: Task[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SHOW_CREATE_DIALOG'; payload: boolean }
  | { type: 'SET_CREATE_TITLE'; payload: string }
  | { type: 'SET_CREATE_DESCRIPTION'; payload: string }
  | { type: 'SET_CREATE_PRIORITY'; payload: TaskPriority }
  | { type: 'SET_CREATING'; payload: boolean }
  | { type: 'RESET_CREATE_FORM' };
