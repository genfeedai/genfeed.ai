import { useResetAgentOnOrganizationChange } from '@genfeedai/agent/hooks/use-reset-agent-on-organization-change';
import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { render, renderHook } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

const demoThread = {
  id: 'thread-demo',
  title: 'Brief Trailhead Notebook',
} as AgentThread;

describe('useResetAgentOnOrganizationChange', () => {
  beforeEach(() => {
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
    useAgentChatStore.setState({
      activeThreadId: demoThread.id,
      threads: [demoThread],
    });
  });

  it('drops the previous organization threads and open conversation', () => {
    const { rerender } = renderHook(
      ({ organizationId }) => useResetAgentOnOrganizationChange(organizationId),
      { initialProps: { organizationId: 'org-demo' } },
    );
    expect(useAgentChatStore.getState().threads).toEqual([demoThread]);

    rerender({ organizationId: 'org-genfeed' });

    const state = useAgentChatStore.getState();
    expect(state.threads).toEqual([]);
    expect(state.activeThreadId).toBeNull();
  });

  it('keeps the thread the new route opens while the stale one clears', () => {
    // Mirrors the shell (parent, owns the hook) and the full page (child),
    // which selects the routed thread in a passive effect of the same commit.
    function Page({ threadId }: { threadId: string }) {
      useEffect(() => {
        useAgentChatStore.getState().setActiveThread(threadId);
      }, [threadId]);
      return null;
    }
    function Shell({
      organizationId,
      threadId,
    }: {
      organizationId: string;
      threadId: string;
    }) {
      useResetAgentOnOrganizationChange(organizationId);
      return <Page threadId={threadId} />;
    }
    const { rerender } = render(
      <Shell organizationId="org-demo" threadId={demoThread.id} />,
    );
    expect(useAgentChatStore.getState().threads).toEqual([demoThread]);

    // Deep link into a thread of the other organization in the same commit
    // that switches organization.
    rerender(<Shell organizationId="org-genfeed" threadId="thread-genfeed" />);

    const state = useAgentChatStore.getState();
    expect(state.activeThreadId).toBe('thread-genfeed');
    expect(state.threads).toEqual([]);
  });

  it('keeps the conversation through the loading gap back to the same organization', () => {
    const { rerender } = renderHook(
      ({ organizationId }) => useResetAgentOnOrganizationChange(organizationId),
      { initialProps: { organizationId: 'org-demo' as string | null } },
    );

    rerender({ organizationId: null });
    rerender({ organizationId: 'org-demo' });

    const state = useAgentChatStore.getState();
    expect(state.threads).toEqual([demoThread]);
    expect(state.activeThreadId).toBe(demoThread.id);
  });

  it('does not reset on first mount', () => {
    renderHook(() => useResetAgentOnOrganizationChange('org-demo'));

    expect(useAgentChatStore.getState().threads).toEqual([demoThread]);
  });
});
