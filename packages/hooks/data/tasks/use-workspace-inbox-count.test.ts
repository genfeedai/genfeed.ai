import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  state: { data: undefined as { unreadCount: number } | undefined },
}));
vi.mock('@hooks/data/tasks/use-workspace-inbox-read', () => ({
  useWorkspaceInboxRead: () => mock,
}));

import { useWorkspaceInboxCount } from './use-workspace-inbox-count';

describe('useWorkspaceInboxCount', () => {
  it('shows no indicator until scoped read status is loaded', () => {
    mock.state.data = undefined;
    const { result } = renderHook(() => useWorkspaceInboxCount());
    expect(result.current).toBe(0);
  });
  it('uses the server count including tasks beyond the loaded table page', () => {
    mock.state.data = { unreadCount: 52 };
    const { result } = renderHook(() => useWorkspaceInboxCount());
    expect(result.current).toBe(52);
  });
});
