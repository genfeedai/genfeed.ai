import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
import { ConversationComposerShellProvider } from '@genfeedai/agent/components/ConversationComposerShellContext';

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

  it('keeps plan mode out and exposes the compact attachment control', () => {
    render(<AgentChatInput onSend={vi.fn()} addFiles={vi.fn()} />);

    expect(screen.queryByText(/Plan mode/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Attach files')).toBeInTheDocument();
    expect(screen.getByLabelText('Open composer actions')).toBeInTheDocument();
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

  it('presents interrupted attachment recovery without pretending it can upload', () => {
    render(
      <AgentChatInput
        attachments={[
          {
            error: 'Upload was interrupted. Reattach this file to retry.',
            id: 'attachment-1',
            kind: 'video',
            name: 'draft.mp4',
            previewUrl: '',
            status: 'failed',
          },
        ]}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('draft.mp4: failed')).toBeInTheDocument();
    expect(screen.getByText('Reattach')).toBeInTheDocument();
  });

  it('dispatches a selected trusted action without clearing or sending the draft', async () => {
    const dispatchAction = vi.fn(() => ({
      message: 'Opened Publish. Explicit approval is still required.',
      status: 'dispatched' as const,
    }));
    const onSend = vi.fn();

    render(
      <ConversationComposerShellProvider
        contextLabel="Conversation"
        dispatchAction={dispatchAction}
        draftScopeKey="acme:thread-1:3"
        portalTarget={null}
        shellState="conversation"
      >
        <AgentChatInput onSend={onSend} />
      </ConversationComposerShellProvider>,
    );

    fireEvent.click(screen.getByLabelText('Open composer actions'));
    fireEvent.click(screen.getByRole('button', { name: /\/publish/i }));
    fireEvent.click(await screen.findByLabelText('Send message'));

    await waitFor(() => {
      expect(dispatchAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.objectContaining({ name: 'publish' }),
        }),
      );
    });
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toHaveTextContent('/publish');
    expect(
      screen.getByText('Opened Publish. Explicit approval is still required.'),
    ).toBeInTheDocument();
  });
});
