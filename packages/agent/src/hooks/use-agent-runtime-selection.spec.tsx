import {
  mockError,
  mockFetch,
  mockJsonApiResource,
} from '@agent-tests/json-api-fetch.mock';
import { useAgentRuntimeSelection } from '@genfeedai/agent/hooks/use-agent-runtime-selection';
import { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import {
  readConversationComposerDraft,
  writeConversationComposerDocument,
} from '@genfeedai/agent/stores/conversation-composer-draft.store';
import { AgentThreadStatus } from '@genfeedai/contracts';
import {
  clearRequestOrganizationId,
  setRequestOrganizationId,
} from '@services/core/interceptor.service';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function makeService() {
  return new AgentApiService({
    baseUrl: 'http://api.test',
    getToken: async () => 'test-token',
  });
}

function seedThread() {
  useAgentChatStore.setState({
    activeThreadId: 'deleted-thread',
    threads: [
      {
        contextVersion: 1,
        createdAt: '2026-10-21T10:00:00Z',
        id: 'deleted-thread',
        status: AgentThreadStatus.ACTIVE,
        runtimeKey: 'local/codex-cli',
        title: 'Existing conversation',
        updatedAt: '2026-10-21T10:00:00Z',
      },
    ],
  });
}

describe('runtime thread update request lifecycle', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
    seedThread();
    window.sessionStorage.clear();
  });

  afterEach(() => clearRequestOrganizationId());

  it('keeps the confirmed runtime and selected thread when deletion wins the update race', async () => {
    writeConversationComposerDocument(
      'org-1:deleted-thread:1',
      { type: 'doc' },
      'Unsent message',
    );
    mockError(404, { message: 'Thread not found' });
    const apiService = makeService();
    const { result } = renderHook(() =>
      useAgentRuntimeSelection({
        apiService,
        isActive: false,
      }),
    );

    await act(async () => {
      result.current.switchToHosted();
    });

    expect(result.current.updateFailure).toBe('missing-thread');
    expect(result.current.selectedRuntime.key).toBe('local/codex-cli');
    expect(
      readConversationComposerDraft('org-1:deleted-thread:1').plainText,
    ).toBe('Unsent message');
    expect(useAgentChatStore.getState().activeThreadId).toBe('deleted-thread');
    expect(mockFetch).toHaveBeenCalledExactlyOnceWith(
      'http://api.test/agent/threads/deleted-thread',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
  it('does not retry a missing-thread draft update when a background thread refresh arrives', async () => {
    useAgentChatStore.setState({ draftRuntimeKey: 'hosted/genfeed' });
    mockError(404, { message: 'Thread not found' });
    const apiService = makeService();
    const { result } = renderHook(() =>
      useAgentRuntimeSelection({ apiService, isActive: false }),
    );
    await act(async () => {});
    expect(result.current.updateFailure).toBe('missing-thread');
    await act(async () => {
      useAgentChatStore
        .getState()
        .updateThread('deleted-thread', { title: 'Refreshed title' });
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(useAgentChatStore.getState().draftRuntimeKey).toBe('hosted/genfeed');
  });

  it('applies a normal update only after the server confirms it', async () => {
    mockJsonApiResource(
      {
        ...useAgentChatStore.getState().threads[0],
        runtimeKey: 'hosted/genfeed',
        requestedModel: '',
      },
      'agent-thread',
    );
    const apiService = makeService();
    const { result } = renderHook(() =>
      useAgentRuntimeSelection({ apiService, isActive: false }),
    );
    await act(async () => {
      result.current.switchToHosted();
    });
    expect(result.current.selectedRuntime.key).toBe('hosted/genfeed');
    expect(result.current.updateFailure).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403])(
    'does not treat HTTP %s as a missing thread or change runtime',
    async (status) => {
      mockError(status, { message: 'Access denied' });
      const apiService = makeService();
      const { result } = renderHook(() =>
        useAgentRuntimeSelection({ apiService, isActive: false }),
      );
      await act(async () => {
        result.current.switchToHosted();
      });
      expect(result.current.updateFailure).toBe('failed');
      expect(result.current.selectedRuntime.key).toBe('local/codex-cli');
      expect(useAgentChatStore.getState().activeThreadId).toBe(
        'deleted-thread',
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['conversation', 'organization'] as const)(
    'ignores a late missing-thread response after switching %s',
    async (scope) => {
      setRequestOrganizationId('org-1');
      const response = Promise.withResolvers<Response>();
      mockFetch.mockReturnValueOnce(response.promise);
      const apiService = makeService();
      const { result } = renderHook(() =>
        useAgentRuntimeSelection({ apiService, isActive: false }),
      );
      await act(async () => {
        result.current.switchToHosted();
      });
      await act(async () => {
        if (scope === 'organization') setRequestOrganizationId('org-2');
        else useAgentChatStore.getState().setActiveThread('another-thread');
        response.resolve(
          new Response(JSON.stringify({ message: 'Thread not found' }), {
            status: 404,
          }),
        );
      });
      expect(result.current.updateFailure).toBeNull();
      expect(useAgentChatStore.getState().threads[0]?.runtimeKey).toBe(
        'local/codex-cli',
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    },
  );

  it('allows an explicit retry after a missing-thread response', async () => {
    mockError(404, { message: 'Thread not found' });
    const apiService = makeService();
    const { result } = renderHook(() =>
      useAgentRuntimeSelection({ apiService, isActive: false }),
    );
    await act(async () => {
      result.current.switchToHosted();
    });
    expect(result.current.updateFailure).toBe('missing-thread');
    mockJsonApiResource(
      {
        ...useAgentChatStore.getState().threads[0],
        runtimeKey: 'hosted/genfeed',
      },
      'agent-thread',
    );
    await act(async () => {
      result.current.switchToHosted();
    });
    expect(result.current.updateFailure).toBeNull();
    expect(result.current.selectedRuntime.key).toBe('hosted/genfeed');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('applies a pending draft runtime once without aborting it on a list refresh', async () => {
    useAgentChatStore.setState({ draftRuntimeKey: 'hosted/genfeed' });
    const response = Promise.withResolvers<Response>();
    mockFetch.mockReturnValueOnce(response.promise);
    const apiService = makeService();
    const { result } = renderHook(() =>
      useAgentRuntimeSelection({ apiService, isActive: false }),
    );
    await act(async () => {
      useAgentChatStore
        .getState()
        .updateThread('deleted-thread', { title: 'Background refresh' });
    });
    const request = mockFetch.mock.calls[0]?.[1];
    expect(request.signal.aborted).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      response.resolve(
        new Response(
          JSON.stringify({
            data: {
              id: 'deleted-thread',
              type: 'agent-thread',
              attributes: {
                ...useAgentChatStore.getState().threads[0],
                runtimeKey: 'hosted/genfeed',
                requestedModel: '',
              },
            },
          }),
        ),
      );
    });
    expect(result.current.selectedRuntime.key).toBe('hosted/genfeed');
    expect(useAgentChatStore.getState().draftRuntimeKey).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
