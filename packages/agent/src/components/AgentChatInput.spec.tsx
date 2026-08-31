import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

vi.mock('@genfeedai/agent/hooks/use-content-mentions', () => ({
  useContentMentions: () => ({
    isLoading: false,
    mentions: [
      {
        contentTitle: 'Launch post',
        contentType: 'post',
        id: 'post-1',
        thumbnailUrl: 'https://cdn.example/launch.jpg',
      },
    ],
  }),
}));

vi.mock('@genfeedai/agent/hooks/use-brand-mentions', () => ({
  useBrandMentions: () => ({ isLoading: false, mentions: [] }),
}));

vi.mock('@genfeedai/agent/hooks/use-team-mentions', () => ({
  useTeamMentions: () => ({ isLoading: false, mentions: [] }),
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

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    organizationId: 'org-1',
    settings: { enabledModelIds: undefined, isVoiceControlEnabled: false },
    settingsLoading: false,
  }),
}));

vi.mock('@ui/dropdowns/model-selector/useModelFavorites', () => ({
  useModelFavorites: () => ({
    favoriteModelKeys: [],
    onFavoriteToggle: vi.fn(),
  }),
}));

// The generation setup popover is `packages/ui` surface with its own
// colocated tests; this composer-body spec only needs it to render inertly.
vi.mock('@ui/dropdowns/generation-setup/GenerationSetupPopover', () => ({
  default: function MockGenerationSetupPopover() {
    return <div data-testid="generation-setup-popover" />;
  },
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

  it('resolves toolbar copy through the host agent catalog', () => {
    const source = readFileSync(
      join(__dirname, 'AgentChatInputToolbar.tsx'),
      'utf8',
    );
    expect(source).toContain("useTranslations('agent.composerToolbar')");
    expect(source).toContain("translate('actionsAria')");
    expect(source).toContain("{translate('actions')}");
    expect(source).toContain("translate('actionsDescription')");
    expect(source).not.toContain('const COPY =');
  });

  it('renders inside the shared prompt bar shell', () => {
    render(<AgentChatInput onSend={vi.fn()} />);

    expect(screen.getByTestId('agent-chat-input-shell')).toBeTruthy();
  });

  it('keeps the prompt shell opaque when disabled', () => {
    render(<AgentChatInput disabled onSend={vi.fn()} />);

    const shell = screen.getByTestId('agent-chat-input-shell');

    expect(shell.className).toMatch(/bg-background\/55|backdrop-blur/);
    expect(shell).not.toHaveClass('opacity-50');
  });

  it('keeps the agent glass surface without an outer shadow', () => {
    render(<AgentChatInput onSend={vi.fn()} />);

    const shell = screen.getByTestId('agent-chat-input-shell');

    expect(shell).toHaveClass(
      'bg-background/70',
      'backdrop-blur-xl',
      '!shadow-none',
      'focus-within:!shadow-none',
    );
    expect(shell).toHaveClass('border', 'border-border-strong/70');
  });

  it('renders the generation setup chip in the leading toolbar slot', () => {
    render(<AgentChatInput onSend={vi.fn()} />);

    expect(screen.getByTestId('generation-setup-popover')).toBeInTheDocument();
  });

  it('renders the stop action within the shell footer when a run is active', () => {
    render(<AgentChatInput onSend={vi.fn()} onStop={vi.fn()} showStop />);

    expect(screen.getByLabelText('Stop agent')).toBeTruthy();
  });

  it('shows queue send beside stop when the composer has text during a run', async () => {
    storeState.composerSeed = {
      content: 'Follow up after this run',
      nonce: 1,
      threadId: null,
    };

    render(
      <AgentChatInput
        onSend={vi.fn()}
        onStop={vi.fn()}
        showStop
        willQueueFollowUp
      />,
    );

    expect(screen.getByLabelText('Stop agent')).toBeTruthy();
    expect(await screen.findByLabelText('Queue follow-up')).toBeTruthy();
  });

  it('keeps the editor writable while a run is active', async () => {
    render(
      <AgentChatInput
        onSend={vi.fn()}
        onStop={vi.fn()}
        showStop
        willQueueFollowUp
      />,
    );

    const editor = await screen.findByRole('textbox');
    expect(editor).toHaveAttribute('contenteditable', 'true');
    expect(editor).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByLabelText('Stop agent')).toBeTruthy();
  });

  it('promotes a queued follow-up on empty Enter and no-ops without a queue', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    const onPromoteQueuedFollowUp = vi.fn();

    const { rerender } = render(
      <AgentChatInput
        hasQueuedFollowUps
        onPromoteQueuedFollowUp={onPromoteQueuedFollowUp}
        onSend={onSend}
        onStop={vi.fn()}
        showStop
        willQueueFollowUp
      />,
    );

    const editor = await screen.findByRole('textbox');
    await user.type(editor, '{Enter}');
    expect(onPromoteQueuedFollowUp).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();

    rerender(
      <AgentChatInput
        onPromoteQueuedFollowUp={onPromoteQueuedFollowUp}
        onSend={onSend}
        onStop={vi.fn()}
        showStop
        willQueueFollowUp
      />,
    );
    await user.type(await screen.findByRole('textbox'), '{Enter}');
    expect(onPromoteQueuedFollowUp).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('blocks enqueue while an attachment is still uploading and keeps the draft', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    storeState.composerSeed = {
      content: 'Send after upload',
      nonce: 2,
      threadId: null,
    };

    render(
      <AgentChatInput
        attachments={[
          {
            id: 'uploading-1',
            kind: 'image',
            name: 'draft.png',
            previewUrl: '',
            status: 'uploading',
          },
        ]}
        isUploading
        onSend={onSend}
        willQueueFollowUp
      />,
    );

    const editor = await screen.findByRole('textbox', {
      name: 'Conversation prompt',
    });
    await user.type(editor, '{Enter}');

    expect(onSend).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'Wait for attachments to finish uploading, then send again.',
      ),
    ).toBeInTheDocument();
    expect(editor).toHaveTextContent('Send after upload');
  });

  it('does not render a context usage meter', () => {
    render(<AgentChatInput onSend={vi.fn()} />);

    expect(
      screen.queryByTestId('composer-context-usage'),
    ).not.toBeInTheDocument();
  });

  it('keeps plan mode out and exposes the compact attachment control', () => {
    render(<AgentChatInput onSend={vi.fn()} addFiles={vi.fn()} />);

    expect(screen.queryByText(/Plan mode/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Add context')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Open workspace shortcuts'),
    ).toBeInTheDocument();
  });

  it('uses the inspector rail treatment without duplicating shell context', () => {
    render(
      <ConversationComposerShellProvider
        contextLabel="Default Workspace · Default Brand"
        draftScopeKey="acme:thread-1:3"
        placement="inspector"
        portalTarget={null}
        shellState="canvas"
      >
        <AgentChatInput density="inspector" onSend={vi.fn()} />
      </ConversationComposerShellProvider>,
    );

    expect(screen.getByTestId('agent-chat-input-shell')).toHaveClass(
      'rounded-[var(--radius-workspace-composer)]',
    );
    expect(
      screen.queryByText('Default Workspace · Default Brand'),
    ).not.toBeInTheDocument();
    // Inspector density is compact: actions control is icon-only (no "Actions" label).
    expect(screen.queryByText('Actions')).not.toBeInTheDocument();
    expect(
      screen.getByLabelText('Open workspace shortcuts'),
    ).toBeInTheDocument();
    expect(getComputedStyle(screen.getByRole('textbox')).minHeight).toBe(
      '56px',
    );
  });

  it('keeps topbar-owned scope controls and shell context labels out of the prompt bar', () => {
    render(
      <ConversationComposerShellProvider
        contextLabel="Default Workspace · Default Brand"
        draftScopeKey="acme:thread-1:3"
        portalTarget={null}
        scopeControls={<button type="button">Change workspace scope</button>}
        shellState="canvas"
      >
        <AgentChatInput onSend={vi.fn()} />
      </ConversationComposerShellProvider>,
    );

    expect(
      screen.queryByText('Default Workspace · Default Brand'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Change workspace scope' }),
    ).not.toBeInTheDocument();
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
      message: 'Opened Publishing. Explicit approval is still required.',
      status: 'dispatched' as const,
    }));
    const onSend = vi.fn();

    render(
      <ConversationComposerShellProvider
        contextLabel="Conversation"
        dispatchAction={dispatchAction}
        draftScopeKey="acme:thread-1:3"
        portalTarget={null}
        shellState="canvas"
      >
        <AgentChatInput onSend={onSend} />
      </ConversationComposerShellProvider>,
    );

    // Actions are a Radix dropdown: the trigger opens on pointerdown and the
    // entries are menuitems, not buttons.
    fireEvent.pointerDown(screen.getByLabelText('Open workspace shortcuts'));
    fireEvent.click(
      await screen.findByRole('menuitem', { name: /\/publish/i }),
    );
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
      screen.getByText(
        'Opened Publishing. Explicit approval is still required.',
      ),
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
          generationMode: 'auto',
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

    // Tray shows the typed reference chip label (no separate "N reference" count).
    expect(screen.getByText('^post:post-1')).toBeInTheDocument();
  });

  it('migrates legacy content mentions into visual reference tiles (deduped with workspace selection)', async () => {
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

    const tray = await screen.findByRole('group', {
      name: 'Composer attachments and references',
    });
    // Legacy ^ tokens become visual tiles; same id as workspace selection → one entry.
    expect(
      within(tray).getByLabelText('Referenced content: Launch post'),
    ).toBeInTheDocument();
    expect(within(tray).queryByText('^Launch post')).not.toBeInTheDocument();
  });

  it('opens the library picker from the reference toolbar control', async () => {
    render(<AgentChatInput onSend={vi.fn()} />);

    fireEvent.pointerDown(screen.getByLabelText('Add context'));
    fireEvent.click(
      await screen.findByRole('menuitem', {
        name: 'Reference library content',
      }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Reference library content' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Reference Launch post' }),
    ).toBeInTheDocument();
  });

  it('attaches a library pick as a removable visual tile (no caret token)', async () => {
    render(<AgentChatInput onSend={vi.fn()} />);

    fireEvent.pointerDown(screen.getByLabelText('Add context'));
    fireEvent.click(
      await screen.findByRole('menuitem', {
        name: 'Reference library content',
      }),
    );
    fireEvent.click(
      await screen.findByRole('option', { name: 'Reference Launch post' }),
    );

    const tray = await screen.findByRole('group', {
      name: 'Composer attachments and references',
    });
    expect(
      within(tray).getByLabelText('Referenced content: Launch post'),
    ).toBeInTheDocument();
    expect(screen.queryByText('^Launch post')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove reference Launch post' }),
    );
    expect(
      screen.queryByLabelText('Referenced content: Launch post'),
    ).not.toBeInTheDocument();
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
        {
          generationMode: 'auto',
          planModeEnabled: false,
        },
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

  it('does not send on Enter when the composer is disabled', async () => {
    const onSend = vi.fn();
    storeState.composerSeed = {
      content: 'Held while disabled',
      nonce: 1,
      threadId: null,
    };

    render(<AgentChatInput disabled onSend={onSend} />);

    const composer = screen.getByRole('textbox');
    await waitFor(() =>
      expect(composer).toHaveTextContent('Held while disabled'),
    );

    fireEvent.keyDown(composer, { key: 'Enter' });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('routes Enter only to the focused composer when two are mounted', async () => {
    const onSendFirst = vi.fn();
    const onSendSecond = vi.fn();
    storeState.composerSeed = {
      content: 'Route to the focused composer',
      nonce: 1,
      threadId: null,
    };

    render(
      <>
        <AgentChatInput onSend={onSendFirst} />
        <AgentChatInput onSend={onSendSecond} />
      </>,
    );

    const composers = screen.getAllByRole('textbox');
    expect(composers).toHaveLength(2);
    await waitFor(() =>
      expect(composers[0]).toHaveTextContent('Route to the focused composer'),
    );

    fireEvent.keyDown(composers[0], { key: 'Enter' });

    await waitFor(() => {
      expect(onSendFirst).toHaveBeenCalledWith(
        'Route to the focused composer',
        undefined,
        undefined,
        {
          generationMode: 'auto',
          planModeEnabled: false,
        },
      );
    });
    expect(onSendSecond).not.toHaveBeenCalled();
  });

  it('changes the empty placeholder to drop it here? while a file is dragged over the prompt bar', async () => {
    const view = render(<AgentChatInput onSend={vi.fn()} />);

    await waitFor(() => {
      expect(
        document.querySelector(
          '[data-placeholder="Ask for help with content, review, or planning…"]',
        ),
      ).toBeTruthy();
    });

    view.rerender(
      <AgentChatInput dragState={{ isActive: true }} onSend={vi.fn()} />,
    );

    await waitFor(() => {
      expect(
        document.querySelector('[data-placeholder="drop it here?"]'),
      ).toBeTruthy();
    });
    expect(screen.queryByText('Drop files here')).not.toBeInTheDocument();
  });
});
