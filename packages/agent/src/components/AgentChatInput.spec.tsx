import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storeState = {
  activeThreadId: null as string | null,
  clearComposerSeed: vi.fn(),
  composerSeed: null as {
    content: string;
    nonce: number;
    threadId: string | null;
  } | null,
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
import { writeConversationComposerDocument } from '@genfeedai/agent/stores/conversation-composer-draft.store';

describe('AgentChatInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    storeState.activeThreadId = null;
    storeState.draftPlanModeEnabled = false;
    storeState.composerSeed = null;
    storeState.threads = [];
  });

  it('renders inside the shared prompt bar shell', () => {
    render(<AgentChatInput onSend={vi.fn()} />);

    expect(screen.getByTestId('agent-chat-input-shell')).toBeTruthy();
  });

  it('keeps the prompt shell opaque when disabled', () => {
    render(<AgentChatInput disabled onSend={vi.fn()} />);

    const shell = screen.getByTestId('agent-chat-input-shell');

    expect(shell).toHaveClass('bg-card');
    expect(shell).not.toHaveClass('opacity-50');
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

  it('renders an authorized typed surface reference without changing the draft', () => {
    render(
      <ConversationComposerShellProvider
        contextLabel="Research"
        draftScopeKey="acme:thread-1:3"
        portalTarget={null}
        references={[
          {
            authorization: 'authorized',
            id: 'video-123',
            kind: 'research-trend-video',
            label: 'Three viral hook patterns',
          },
        ]}
        shellState="canvas"
      >
        <AgentChatInput onSend={vi.fn()} />
      </ConversationComposerShellProvider>,
    );

    expect(screen.getByText('Three viral hook patterns')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).not.toHaveTextContent(
      'Three viral hook patterns',
    );
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

  it('shows and sends the selected surface artifact as a typed reference', async () => {
    const onSend = vi.fn();
    storeState.composerSeed = {
      content: 'Discuss this selected visual',
      nonce: 1,
      threadId: null,
    };

    render(
      <ConversationComposerShellProvider
        artifactReferences={[
          {
            label: 'Launch visual · v3',
            reference: {
              brandId: 'brand-1',
              kind: 'ingredient',
              organizationId: 'organization-1',
              recordId: 'ingredient-v3',
              serializer: 'ingredient',
            },
          },
        ]}
        brandId="brand-1"
        contextLabel="Studio · Image"
        draftScopeKey="acme:thread-1:3"
        portalTarget={null}
        shellState="canvas"
      >
        <AgentChatInput onSend={onSend} />
      </ConversationComposerShellProvider>,
    );

    expect(screen.getByText('Launch visual · v3')).toBeInTheDocument();
    fireEvent.click(await screen.findByLabelText('Send message'));

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith(
        'Discuss this selected visual',
        undefined,
        undefined,
        {
          artifactReferences: [
            {
              brandId: 'brand-1',
              kind: 'ingredient',
              organizationId: 'organization-1',
              recordId: 'ingredient-v3',
              serializer: 'ingredient',
            },
          ],
          brandId: 'brand-1',
          planModeEnabled: false,
        },
      );
    });
  });

  it('exposes selected surface artifact references in the composer context', () => {
    render(
      <ConversationComposerShellProvider
        artifactReferences={[
          {
            brandId: 'brand-1',
            kind: 'post',
            organizationId: 'org-1',
            recordId: 'post-1',
            serializer: 'post',
          },
        ]}
        contextLabel="Brand Workspace overview"
        draftScopeKey="acme:thread-1:3"
        portalTarget={null}
        shellState="canvas"
      >
        <AgentChatInput onSend={vi.fn()} />
      </ConversationComposerShellProvider>,
    );

    expect(screen.getByText('1 reference')).toBeInTheDocument();
    expect(screen.getByText('^post:post-1')).toBeInTheDocument();
  });

  it('renders one tray item and count when an editor mention overlaps a workspace selection', () => {
    const draftScopeKey = 'acme:thread-overlap:1';
    writeConversationComposerDocument(
      draftScopeKey,
      {
        content: [
          {
            content: [
              { text: 'Review ', type: 'text' },
              {
                attrs: {
                  contentId: 'post-1',
                  contentTitle: 'Launch post',
                  contentType: 'post',
                },
                type: 'contentMention',
              },
            ],
            type: 'paragraph',
          },
        ],
        type: 'doc',
      },
      'Review Launch post',
    );

    render(
      <ConversationComposerShellProvider
        artifactReferences={[
          {
            brandId: 'brand-1',
            kind: 'post',
            organizationId: 'org-1',
            recordId: 'post-1',
            serializer: 'post',
          },
        ]}
        contextLabel="Brand Workspace overview"
        draftScopeKey={draftScopeKey}
        portalTarget={null}
        shellState="canvas"
      >
        <AgentChatInput onSend={vi.fn()} />
      </ConversationComposerShellProvider>,
    );

    const tray = screen.getByRole('group', {
      name: 'Composer attachments and references',
    });
    expect(screen.getByText('1 reference')).toBeInTheDocument();
    expect(within(tray).getAllByText('^Launch post')).toHaveLength(1);
  });

  it('sends the draft when Enter is pressed without a modifier', async () => {
    const onSend = vi.fn();
    storeState.composerSeed = {
      content: 'Ship the composer fix',
      nonce: 1,
      threadId: null,
    };

    render(<AgentChatInput onSend={onSend} />);

    const composer = screen.getByRole('textbox');
    await waitFor(() =>
      expect(composer).toHaveTextContent('Ship the composer fix'),
    );

    fireEvent.keyDown(composer, { key: 'Enter' });

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith(
        'Ship the composer fix',
        undefined,
        undefined,
        { planModeEnabled: false },
      );
    });
  });

  it('inserts a newline instead of sending on Shift+Enter', async () => {
    const onSend = vi.fn();
    storeState.composerSeed = {
      content: 'First line',
      nonce: 1,
      threadId: null,
    };

    render(<AgentChatInput onSend={onSend} />);

    const composer = screen.getByRole('textbox');
    await waitFor(() => expect(composer).toHaveTextContent('First line'));

    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not send on Enter when the composer is empty', () => {
    const onSend = vi.fn();

    render(<AgentChatInput onSend={onSend} />);

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not send on Enter while an IME composition is active', async () => {
    const onSend = vi.fn();
    storeState.composerSeed = {
      content: 'こんにちは',
      nonce: 1,
      threadId: null,
    };

    render(<AgentChatInput onSend={onSend} />);

    const composer = screen.getByRole('textbox');
    await waitFor(() => expect(composer).toHaveTextContent('こんにちは'));

    fireEvent.compositionStart(composer);
    fireEvent.keyDown(composer, {
      isComposing: true,
      key: 'Enter',
      keyCode: 229,
    });

    expect(onSend).not.toHaveBeenCalled();
  });
});
