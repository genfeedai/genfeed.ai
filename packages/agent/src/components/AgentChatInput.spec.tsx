import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('keeps plan mode and file picker controls out of the composer', () => {
    render(<AgentChatInput onSend={vi.fn()} addFiles={vi.fn()} />);

    expect(screen.queryByText(/Plan mode/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Attach image')).not.toBeInTheDocument();
  });

  it('adds pasted image files to the prompt attachments', () => {
    const addFiles = vi.fn();
    const file = new File(['image'], 'image.png', { type: 'image/png' });

    render(<AgentChatInput onSend={vi.fn()} addFiles={addFiles} />);

    fireEvent.paste(screen.getByTestId('agent-chat-input-shell'), {
      clipboardData: { files: [file] },
    });

    expect(addFiles).toHaveBeenCalledWith([file]);
  });

  it('renders image attachments above the editor with a remove action', () => {
    const removeAttachment = vi.fn();
    const file = new File(['image'], 'image.png', { type: 'image/png' });

    render(
      <AgentChatInput
        onSend={vi.fn()}
        attachments={[
          {
            file,
            id: 'attachment-1',
            kind: 'image',
            name: 'image.png',
            previewUrl: 'blob:image-preview',
            status: 'completed',
          },
        ]}
        removeAttachment={removeAttachment}
      />,
    );

    const removeButton = screen.getByRole('button', {
      name: 'Remove image.png',
    });

    expect(screen.getByAltText('image.png')).toBeInTheDocument();
    fireEvent.click(removeButton);
    expect(removeAttachment).toHaveBeenCalledWith('attachment-1');
  });
});
