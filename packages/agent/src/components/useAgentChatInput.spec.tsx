import { ConversationComposerShellProvider } from '@genfeedai/agent/components/ConversationComposerShellContext';
import {
  areAgentChatMentionReferencesEqual,
  useAgentChatInput,
} from '@genfeedai/agent/components/useAgentChatInput';
import { writeConversationComposerDocument } from '@genfeedai/agent/stores/conversation-composer-draft.store';
import type { AgentArtifactReference } from '@genfeedai/interfaces';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TextSelection } from '@tiptap/pm/state';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storeState = {
  activeThreadId: null,
  clearComposerSeed: vi.fn(),
  composerSeed: null,
};

vi.mock('@genfeedai/agent/hooks/use-brand-mentions', () => ({
  useBrandMentions: () => ({ mentions: [] }),
}));

vi.mock('@genfeedai/agent/hooks/use-content-mentions', () => ({
  useContentMentions: () => ({ isLoading: false, mentions: [] }),
}));

vi.mock('@genfeedai/agent/hooks/use-credential-mentions', () => ({
  useCredentialMentions: () => ({ mentions: [] }),
}));

vi.mock('@genfeedai/agent/hooks/use-team-mentions', () => ({
  useTeamMentions: () => ({ mentions: [] }),
}));

const microphoneState = {
  isListening: false,
  isSupported: true,
  isTranscribing: false,
  startListening: vi.fn(),
  stopListening: vi.fn(),
};

vi.mock('@genfeedai/agent/hooks/use-microphone-input', () => ({
  useMicrophoneInput: () => microphoneState,
}));

const brandSettings = {
  settings: { isVoiceControlEnabled: false },
};

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => brandSettings,
}));

vi.mock('@genfeedai/agent/stores/agent-chat.store', () => ({
  useAgentChatStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector(storeState),
}));

const draftScopeKey = 'acme:thread-overlap:1';
const workspaceReferences = [
  {
    brandId: 'brand-1',
    kind: 'post',
    organizationId: 'org-1',
    recordId: 'post-1',
    serializer: 'post',
  },
  {
    brandId: 'brand-1',
    kind: 'post',
    organizationId: 'org-1',
    recordId: 'post-3',
    serializer: 'post',
  },
] as const satisfies readonly AgentArtifactReference[];

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <ConversationComposerShellProvider
      artifactReferences={workspaceReferences}
      contextLabel="Brand Workspace overview"
      draftScopeKey={draftScopeKey}
      portalTarget={null}
      shellState="canvas"
    >
      {children}
    </ConversationComposerShellProvider>
  );
}

describe('areAgentChatMentionReferencesEqual', () => {
  it('returns true only when id, label, type, and order match', () => {
    const base = [
      { id: 'a', label: '#Acme', type: 'brand' as const },
      { id: 'b', label: '@Pat', type: 'team' as const },
    ];

    expect(areAgentChatMentionReferencesEqual(base, [...base])).toBe(true);
    expect(
      areAgentChatMentionReferencesEqual(base, [
        { id: 'a', label: '#Acme', type: 'brand' },
        { id: 'b', label: '@Pat Updated', type: 'team' },
      ]),
    ).toBe(false);
    expect(
      areAgentChatMentionReferencesEqual(base, [
        { id: 'b', label: '@Pat', type: 'team' },
        { id: 'a', label: '#Acme', type: 'brand' },
      ]),
    ).toBe(false);
  });
});

describe('useAgentChatInput voice exclusivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    microphoneState.isListening = false;
    microphoneState.isTranscribing = false;
    microphoneState.isSupported = true;
    brandSettings.settings.isVoiceControlEnabled = true;
    storeState.activeThreadId = null;
    storeState.composerSeed = null;
  });

  it('blocks handleSend while the mic is listening', async () => {
    writeConversationComposerDocument(
      draftScopeKey,
      {
        content: [
          {
            content: [{ text: 'Hello from voice mode', type: 'text' }],
            type: 'paragraph',
          },
        ],
        type: 'doc',
      },
      'Hello from voice mode',
    );

    const onSend = vi.fn();
    const { result } = renderHook(() => useAgentChatInput({ onSend }), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.editor).not.toBeNull();
    });

    microphoneState.isListening = true;
    // Re-render is not automatic for module state — force via editor tick.
    await act(async () => {
      result.current.editor?.commands.setContent('Hello from voice mode');
    });

    // After re-creating the hook with listening flag, send must no-op.
    // The handleSend closure reads isListening from the latest render of the
    // hook; mock module state is read on each useMicrophoneInput() call, so
    // remount the hook.
    const { result: listeningResult, unmount } = renderHook(
      () => useAgentChatInput({ onSend }),
      { wrapper: Wrapper },
    );
    await waitFor(() => {
      expect(listeningResult.current.editor).not.toBeNull();
    });
    expect(listeningResult.current.isListening).toBe(true);

    await act(async () => {
      await listeningResult.current.handleSend();
    });

    expect(onSend).not.toHaveBeenCalled();
    unmount();
  });

  it('hides the mic while Stop is on the trailing edge', async () => {
    const { result } = renderHook(
      () => useAgentChatInput({ onSend: vi.fn(), showStop: true }),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(result.current.editor).not.toBeNull();
    });

    expect(result.current.shouldShowVoiceInput).toBe(false);
  });
});

describe('useAgentChatInput generation mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('sends the selected generation mode with the turn', async () => {
    const onSend = vi.fn();
    const { result } = renderHook(
      () =>
        useAgentChatInput({
          generationMode: 'video',
          generationSettings: {
            aspectRatio: '9:16',
            duration: 5,
            model: 'replicate/video-model',
          },
          onSend,
        }),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(result.current.editor).not.toBeNull();
    });
    act(() => {
      result.current.editor?.commands.setContent('Create a launch reel');
    });
    await act(async () => {
      await result.current.handleSend();
    });

    expect(onSend).toHaveBeenCalledWith(
      'Create a launch reel',
      undefined,
      undefined,
      expect.objectContaining({
        generationMode: 'video',
        generationSettings: {
          aspectRatio: '9:16',
          duration: 5,
          model: 'replicate/video-model',
        },
      }),
    );
  });

  it('removes restored brand tags while preserving route brand scope', async () => {
    writeConversationComposerDocument(
      draftScopeKey,
      {
        content: [
          {
            content: [
              {
                attrs: { id: 'brand-1', label: 'Acme' },
                type: 'brandMention',
              },
            ],
            type: 'paragraph',
          },
        ],
        type: 'doc',
      },
      '#undefined',
    );
    const onSend = vi.fn();
    const BrandScopedWrapper = ({ children }: { children: ReactNode }) => (
      <ConversationComposerShellProvider
        brandId="brand-1"
        contextLabel="Acme"
        draftScopeKey={draftScopeKey}
        portalTarget={null}
        shellState="canvas"
      >
        {children}
      </ConversationComposerShellProvider>
    );

    const { result } = renderHook(() => useAgentChatInput({ onSend }), {
      wrapper: BrandScopedWrapper,
    });

    await waitFor(() => {
      expect(result.current.editor).not.toBeNull();
      expect(result.current.editor?.getText()).toBe('');
    });
    expect(result.current.references).toEqual([]);

    act(() => {
      result.current.editor?.commands.setContent('Create a launch image');
    });
    await act(async () => {
      await result.current.handleSend();
    });

    expect(onSend).toHaveBeenCalledWith(
      'Create a launch image',
      undefined,
      undefined,
      expect.objectContaining({ brandId: 'brand-1' }),
    );
  });
});

describe('useAgentChatInput references', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    microphoneState.isListening = false;
    brandSettings.settings.isVoiceControlEnabled = false;
    writeConversationComposerDocument(
      draftScopeKey,
      {
        content: [
          {
            content: [
              { text: 'Compare ', type: 'text' },
              {
                attrs: {
                  contentId: 'post-1',
                  contentTitle: 'Launch post',
                  contentType: 'post',
                },
                type: 'contentMention',
              },
              { text: ' with ', type: 'text' },
              {
                attrs: {
                  contentId: 'post-2',
                  contentTitle: 'Campaign brief',
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
      'Compare Launch post with Campaign brief',
    );
  });

  it('deduplicates displayed stable IDs without changing workspace selections', async () => {
    const onSend = vi.fn();
    const { result } = renderHook(() => useAgentChatInput({ onSend }), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.editor).not.toBeNull();
    });

    // Legacy `contentMention` nodes migrate into visual reference tiles, so a
    // content entry carries its type/title instead of a `^` caret token.
    expect(result.current.references).toEqual([
      {
        contentType: 'post',
        id: 'post-1',
        label: 'Launch post',
        thumbnailUrl: undefined,
        type: 'content',
      },
      {
        contentType: 'post',
        id: 'post-2',
        label: 'Campaign brief',
        thumbnailUrl: undefined,
        type: 'content',
      },
      { id: 'post-3', label: '^post:post-3', type: 'asset' },
    ]);

    await act(async () => {
      await result.current.handleSend();
    });

    expect(onSend).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      undefined,
      expect.objectContaining({
        artifactReferences: workspaceReferences,
      }),
    );
  });
});

describe('useAgentChatInput draft restore selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('restores a draft with a collapsed caret so paste appends', async () => {
    writeConversationComposerDocument(
      draftScopeKey,
      {
        content: [
          {
            content: [{ text: 'k fldsjf slkdj slkdj f', type: 'text' }],
            type: 'paragraph',
          },
        ],
        type: 'doc',
      },
      'k fldsjf slkdj slkdj f',
    );

    const { result } = renderHook(
      () => useAgentChatInput({ onSend: vi.fn() }),
      {
        wrapper: Wrapper,
      },
    );

    await waitFor(() => {
      expect(result.current.editor).not.toBeNull();
    });

    const editor = result.current.editor;
    expect(editor).not.toBeNull();
    if (!editor) {
      return;
    }

    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.from).toBe(
      TextSelection.atEnd(editor.state.doc).to,
    );

    const preventDefault = vi.fn();
    await act(async () => {
      editor.view.someProp('handlePaste', (handler) =>
        handler(
          editor.view,
          {
            clipboardData: {
              files: [],
              getData: (type: string) =>
                type === 'text/plain' ? 'and more' : '',
              items: [],
              types: ['text/plain'],
            },
            preventDefault,
          } as unknown as ClipboardEvent,
          null,
        ),
      );
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(editor.getText()).toBe('k fldsjf slkdj slkdj fand more');
  });

  it('grows the prompt when the same clipboard is pasted over a highlight', async () => {
    writeConversationComposerDocument(
      draftScopeKey,
      {
        content: [
          {
            content: [{ text: 'go', type: 'text' }],
            type: 'paragraph',
          },
        ],
        type: 'doc',
      },
      'go',
    );

    const { result } = renderHook(
      () => useAgentChatInput({ onSend: vi.fn() }),
      {
        wrapper: Wrapper,
      },
    );

    await waitFor(() => {
      expect(result.current.editor).not.toBeNull();
    });

    const editor = result.current.editor;
    expect(editor).not.toBeNull();
    if (!editor) {
      return;
    }

    await act(async () => {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    });

    await act(async () => {
      editor.commands.selectAll();
    });

    const pasteGo = () => {
      editor.view.someProp('handlePaste', (handler) =>
        handler(
          editor.view,
          {
            clipboardData: {
              files: [],
              getData: (type: string) => (type === 'text/plain' ? 'go' : ''),
              items: [],
              types: ['text/plain'],
            },
            preventDefault: vi.fn(),
          } as unknown as ClipboardEvent,
          null,
        ),
      );
    };

    await act(async () => {
      pasteGo();
      pasteGo();
      pasteGo();
      pasteGo();
      pasteGo();
    });

    expect(editor.getText()).toBe('gogogogogo');
  });
});

describe('useAgentChatInput media paste', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('suppresses the editor default paste path when clipboard has media files', async () => {
    const onSend = vi.fn();
    const { result } = renderHook(() => useAgentChatInput({ onSend }), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.editor).not.toBeNull();
    });

    const editor = result.current.editor;
    expect(editor).not.toBeNull();
    if (!editor) {
      return;
    }

    const preventDefault = vi.fn();
    const image = new File(['fake'], 'shot.png', { type: 'image/png' });
    const clipboardData = {
      files: [image],
      getData: () => 'fallback text from image paste',
      items: [],
      types: ['Files', 'text/plain'],
    } as unknown as DataTransfer;

    const handled = editor.view.someProp('handlePaste', (handler) =>
      handler(
        editor.view,
        {
          clipboardData,
          preventDefault,
        } as unknown as ClipboardEvent,
        null,
      ),
    );

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
  });
});

describe('useAgentChatInput follow-up queue submit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    microphoneState.isListening = false;
    microphoneState.isTranscribing = false;
    brandSettings.settings.isVoiceControlEnabled = false;
  });

  it('promotes the queued follow-up on empty submit and no-ops without a queue', async () => {
    const onPromoteQueuedFollowUp = vi.fn();
    const onSend = vi.fn();
    const { rerender, result } = renderHook(
      ({ hasQueuedFollowUps }: { hasQueuedFollowUps: boolean }) =>
        useAgentChatInput({
          hasQueuedFollowUps,
          onPromoteQueuedFollowUp,
          onSend,
        }),
      { initialProps: { hasQueuedFollowUps: true }, wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(result.current.editor).not.toBeNull();
    });

    await act(async () => {
      await result.current.handleSend();
    });
    expect(onPromoteQueuedFollowUp).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();

    rerender({ hasQueuedFollowUps: false });
    await act(async () => {
      await result.current.handleSend();
    });
    expect(onPromoteQueuedFollowUp).toHaveBeenCalledTimes(1);
  });

  it('keeps composer contents when enqueue is rejected', async () => {
    writeConversationComposerDocument(
      draftScopeKey,
      {
        content: [
          {
            content: [{ text: 'Queue me', type: 'text' }],
            type: 'paragraph',
          },
        ],
        type: 'doc',
      },
      'Queue me',
    );
    const onSend = vi.fn(() => false);
    const { result } = renderHook(() => useAgentChatInput({ onSend }), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.editor).not.toBeNull();
    });

    await act(async () => {
      await result.current.handleSend();
    });

    expect(onSend).toHaveBeenCalled();
    expect(result.current.actionFeedback).toBe(
      'Follow-up queue is full. Remove a prompt or wait until one sends.',
    );
    expect(result.current.editor?.getText()).toBe('Queue me');
  });

  it('blocks submit while attachments are uploading and preserves the draft', async () => {
    writeConversationComposerDocument(
      draftScopeKey,
      {
        content: [
          {
            content: [{ text: 'With photo', type: 'text' }],
            type: 'paragraph',
          },
        ],
        type: 'doc',
      },
      'With photo',
    );
    const onSend = vi.fn();
    const { result } = renderHook(
      () =>
        useAgentChatInput({
          attachments: [
            {
              id: 'att-1',
              kind: 'image',
              name: 'shot.png',
              previewUrl: '',
              status: 'uploading',
            },
          ],
          isUploading: true,
          onSend,
        }),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(result.current.editor).not.toBeNull();
    });

    await act(async () => {
      await result.current.handleSend();
    });

    expect(onSend).not.toHaveBeenCalled();
    expect(result.current.actionFeedback).toBe(
      'Wait for attachments to finish uploading, then send again.',
    );
    expect(result.current.editor?.getText()).toBe('With photo');
  });

  it('keeps Shift+Enter in the editor without submitting or promoting', async () => {
    writeConversationComposerDocument(
      draftScopeKey,
      {
        content: [
          {
            content: [{ text: 'Keep typing', type: 'text' }],
            type: 'paragraph',
          },
        ],
        type: 'doc',
      },
      'Keep typing',
    );
    const onPromoteQueuedFollowUp = vi.fn();
    const onSend = vi.fn();
    const { result } = renderHook(
      () =>
        useAgentChatInput({
          hasQueuedFollowUps: true,
          onPromoteQueuedFollowUp,
          onSend,
        }),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(result.current.editor).not.toBeNull();
    });

    const editor = result.current.editor;
    expect(editor).not.toBeNull();
    if (!editor) {
      return;
    }

    const handled = editor.view.someProp('handleKeyDown', (handler) =>
      handler(editor.view, {
        key: 'Enter',
        shiftKey: true,
        preventDefault: vi.fn(),
      } as unknown as KeyboardEvent),
    );

    expect(handled).toBe(true);
    expect(onSend).not.toHaveBeenCalled();
    expect(onPromoteQueuedFollowUp).not.toHaveBeenCalled();
  });
});
