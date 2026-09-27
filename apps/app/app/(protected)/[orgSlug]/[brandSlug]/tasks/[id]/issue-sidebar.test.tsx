import '@testing-library/jest-dom/vitest';
import type { IssueSidebarProps } from '@props/tasks/issue-sidebar.props';
import type {
  Task,
  TaskLinkedEntityModel,
  TaskPriority,
  TaskStatus,
} from '@services/management/tasks.service';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import IssueSidebar from './issue-sidebar';

// The "View parent" link must be scope-aware (#5397): a bare
// `APP_ROUTES.WORKSPACE.TASKS` href renders on a pathname the workspace-shell
// registry never recognizes (`resolveWorkspaceShellRoute`), so following it
// leaves the inspector unable to activate.
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/brand-x${path}`,
  }),
}));

const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  blocked: 'Blocked',
  cancelled: 'Cancelled',
  done: 'Done',
  failed: 'Failed',
  in_progress: 'In Progress',
  in_review: 'In Review',
  todo: 'To Do',
};

const STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  backlog: [],
  blocked: [],
  cancelled: [],
  done: [],
  failed: [],
  in_progress: [],
  in_review: [],
  todo: [],
};

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  critical: '',
  high: '',
  low: '',
  medium: '',
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  critical: 'Critical',
  high: 'High',
  low: 'Low',
  medium: 'Medium',
};

const ENTITY_MODEL_COLORS: Record<TaskLinkedEntityModel, string> = {
  Article: '',
  Evaluation: '',
  Ingredient: '',
  Post: '',
};

const ENTITY_MODEL_LABELS: Record<TaskLinkedEntityModel, string> = {
  Article: 'Article',
  Evaluation: 'Evaluation',
  Ingredient: 'Ingredient',
  Post: 'Post',
};

function buildProps(overrides?: Partial<IssueSidebarProps>): IssueSidebarProps {
  return {
    entityModelColors: ENTITY_MODEL_COLORS,
    entityModelLabels: ENTITY_MODEL_LABELS,
    issue: {
      createdAt: '2026-03-31T08:00:00.000Z',
      linkedEntities: [],
      parentId: 'task-parent-1',
      priority: 'medium',
      status: 'todo',
      updatedAt: '2026-03-31T08:00:00.000Z',
    } as Task,
    onStatusUpdate: vi.fn(),
    priorityColors: PRIORITY_COLORS,
    priorityLabels: PRIORITY_LABELS,
    statusLabels: STATUS_LABELS,
    statusTransitions: STATUS_TRANSITIONS,
    ...overrides,
  };
}

describe('IssueSidebar', () => {
  it('scopes the parent-issue link so the workspace shell recognizes the destination', () => {
    render(<IssueSidebar {...buildProps()} />);

    expect(screen.getByRole('link', { name: 'View parent' })).toHaveAttribute(
      'href',
      '/acme/brand-x/workspace/tasks/task-parent-1',
    );
  });
});
