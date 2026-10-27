import { useResetAgentOnOrganizationChange } from '@genfeedai/agent/hooks/use-reset-agent-on-organization-change';
import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { renderHook } from '@testing-library/react';
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
