import '@testing-library/jest-dom/vitest';
import type { SubIssueRowProps } from '@props/tasks/sub-issue-row.props';
import type { Task, TaskStatus } from '@services/management/tasks.service';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SubIssueRow } from './sub-issue-row';

// The row's href must be scope-aware (#5397): a bare `APP_ROUTES.WORKSPACE.TASKS`
// href renders on a pathname the workspace-shell registry never recognizes
// (`resolveWorkspaceShellRoute`), so following it leaves the inspector unable
// to activate. `href()` builds the brand-scoped path when a brand is
// selected, else falls back to the org-scoped one.
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

function buildProps(overrides?: Partial<SubIssueRowProps>): SubIssueRowProps {
  return {
    issue: {
      identifier: 'GEN-2',
      status: 'todo',
      title: 'Sub-issue title',
    } as Task,
    statusLabels: STATUS_LABELS,
    ...overrides,
  };
}

describe('SubIssueRow', () => {
  it('scopes the row link so the workspace shell recognizes the destination', () => {
    render(<SubIssueRow {...buildProps()} />);

    expect(screen.getByRole('link', { name: /GEN-2/i })).toHaveAttribute(
      'href',
      '/acme/brand-x/workspace/tasks/GEN-2',
    );
  });
});
