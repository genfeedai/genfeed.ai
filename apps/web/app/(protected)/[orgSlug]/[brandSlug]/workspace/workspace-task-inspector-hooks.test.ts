import type { Task } from '@services/management/tasks.service';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceTaskLinkedIssue } from './workspace-task-inspector-hooks';

// `vi.hoisted`: the mocked `useOrgUrl`/`useAuthIdentity` below must return the
// *same* `href`/`getToken` function identity on every render, matching the
// real hooks' own `useCallback` memoization — otherwise the effect that
// depends on them (`[getToken, href, task]`) never settles and the hook
// re-fetches forever (an unbounded async loop that OOMs the test worker
// rather than tripping React's synchronous "too many re-renders" guard).
const mocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  getToken: vi.fn(async () => 'test-token'),
  href: vi.fn((path: string) => `/acme/brand-x${path}`),
}));

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken: mocks.getToken }),
}));

// The linked-issue href must be scope-aware (#5397): a bare
// `APP_ROUTES.WORKSPACE.TASKS` href renders on a pathname the workspace-shell
// registry never recognizes (`resolveWorkspaceShellRoute`), so following it
// (e.g. from `WorkspaceTaskInspectorHeader`'s "openIssue" menu item) leaves
// the inspector unable to activate.
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: mocks.href }),
}));

vi.mock('@services/management/tasks.service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@services/management/tasks.service')>();

  return {
    ...actual,
    TasksService: {
      getInstance: () => ({ findOne: mocks.findOne }),
    },
  };
});

// `workspace-task-inspector-hooks.ts` also imports these for its sibling
// hooks (unused by the one under test here) — mocked to keep this file's
// module graph light, matching `workspace-page.test.tsx`'s convention.
vi.mock('@services/automation/workflow-executions.service', () => ({
  WorkflowExecutionsService: {
    getInstance: () => ({ getById: vi.fn() }),
  },
}));

vi.mock('@services/content/ingredients.service', () => ({
  IngredientsService: {
    getInstance: () => ({ findByIds: vi.fn() }),
  },
}));

describe('useWorkspaceTaskLinkedIssue', () => {
  it('scopes the resolved linked-issue href so the workspace shell recognizes the destination', async () => {
    mocks.findOne.mockResolvedValue({ identifier: 'GEN-9' });
    const task = { id: 'task-1', linkedIssueId: 'task-linked-1' } as Task;

    const { result } = renderHook(() => useWorkspaceTaskLinkedIssue(task));

    await waitFor(() =>
      expect(result.current.href).toBe('/acme/brand-x/workspace/tasks/GEN-9'),
    );
    expect(result.current.identifier).toBe('GEN-9');
  });
});
