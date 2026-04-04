import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateThreadMock = vi.fn();
const storeState = {
  activeThreadId: null as string | null,
  clearComposerSeed: vi.fn(),
  composerSeed: null,
  draftPlanModeEnabled: false,
  setDraftPlanModeEnabled: vi.fn((enabled: boolean) => {
    storeState.draftPlanModeEnabled = enabled;
  }),
  threads: [] as Array<{ id: string; planModeEnabled?: boolean }>,
  updateThread: vi.fn(
    (threadId: string, patch: { planModeEnabled?: boolean }) => {
      storeState.threads = storeState.threads.map((thread) =>
        thread.id === threadId ? { ...thread, ...patch } : thread,
      );
    },
  ),
};

vi.mock('@genfeedai/agent/hooks/use-credential-mentions', () => ({
  useCredentialMentions: () => ({
    mentions: [],
  }),
}));

vi.mock('@genfeedai/agent/hooks/use-microphone-input', () => ({
  useMicrophoneInput: () => ({
    isListening: false,
    isSupported: false,
    isTranscribing: false,
    startListening: vi.fn(),
    stopListening: vi.fn(),
  }),
}));

vi.mock('@genfeedai/agent/stores/agent-chat.store', () => ({
  useAgentChatStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector(storeState),
}));

import { AgentChatInput } from '@genfeedai/agent/components/AgentChatInput';

describe('AgentChatInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState.activeThreadId = null;
    storeState.draftPlanModeEnabled = false;
    storeState.threads = [];
  });

  it('renders inside the shared prompt bar shell', () => {
    render(<AgentChatInput onSend={vi.fn()} />);

    expect(screen.getByTestId('agent-chat-input-shell')).toBeTruthy();
  });

  it('renders the stop action within the shell footer when a run is active', () => {
    render(<AgentChatInput onSend={vi.fn()} onStop={vi.fn()} showStop />);

    expect(screen.getByLabelText('Stop agent')).toBeTruthy();
  });

  it('renders a plan mode toggle and persists the change for the active thread', async () => {
    storeState.activeThreadId = 'thread-1';
    storeState.threads = [{ id: 'thread-1', planModeEnabled: false }];

    render(
      <AgentChatInput
        apiService={
          {
            updateThread: updateThreadMock,
            updateThreadEffect: vi.fn(
              (...args: Parameters<typeof updateThreadMock>) =>
                Effect.promise(() => updateThreadMock(...args)),
            ),
          } as never
        }
        onSend={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Enable plan mode' }));

    await waitFor(() => {
      expect(updateThreadMock).toHaveBeenCalledWith('thread-1', {
        planModeEnabled: true,
      });
    });
  });

  it('toggles plan mode with Shift+Tab', async () => {
    storeState.activeThreadId = 'thread-1';
    storeState.threads = [{ id: 'thread-1', planModeEnabled: false }];

    render(
      <AgentChatInput
        apiService={
          {
            updateThread: updateThreadMock,
            updateThreadEffect: vi.fn(
              (...args: Parameters<typeof updateThreadMock>) =>
                Effect.promise(() => updateThreadMock(...args)),
            ),
          } as never
        }
        onSend={vi.fn()}
      />,
    );

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

    await waitFor(() => {
      expect(updateThreadMock).toHaveBeenCalledWith('thread-1', {
        planModeEnabled: true,
      });
    });
  });

  it('does not toggle plan mode with Shift+Tab while a listbox overlay is open', async () => {
    storeState.activeThreadId = 'thread-1';
    storeState.threads = [{ id: 'thread-1', planModeEnabled: false }];

    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'listbox');
    overlay.setAttribute('data-state', 'open');
    document.body.appendChild(overlay);

    render(
      <AgentChatInput
        apiService={
          {
            updateThread: updateThreadMock,
            updateThreadEffect: vi.fn(
              (...args: Parameters<typeof updateThreadMock>) =>
                Effect.promise(() => updateThreadMock(...args)),
            ),
          } as never
        }
        onSend={vi.fn()}
      />,
    );

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

    await waitFor(() => {
      expect(updateThreadMock).not.toHaveBeenCalled();
    });

    overlay.remove();
  });
});
