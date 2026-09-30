import { ConversationComposerShellProvider } from '@genfeedai/agent/components/ConversationComposerShellContext';
import {
  areAgentChatMentionReferencesEqual,
  useAgentChatInput,
} from '@genfeedai/agent/components/useAgentChatInput';
import {
  attachContentToConversationDraft,
  writeConversationComposerDocument,
  writeDismissedSurfaceReferenceKeys,
} from '@genfeedai/agent/stores/conversation-composer-draft.store';
import type { AgentArtifactReference } from '@genfeedai/contracts/interfaces';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TextSelection } from '@tiptap/pm/state';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storeState = {
  activeThreadId: null as string | null,
  threads: [] as Array<{ id: string; brandId: string | null }>,
  clearComposerSeed: vi.fn(),
  composerSeed: null,
};

vi.mock('@genfeedai/agent/hooks/use-brand-mentions', () => ({
  useBrandMentions: () => ({ mentions: [] }),
}));

const { contentMentionsMock } = vi.hoisted(() => ({
  contentMentionsMock: vi.fn(() => ({ isLoading: false, mentions: [] })),
}));
vi.mock('@genfeedai/agent/hooks/use-content-mentions', () => ({
  useContentMentions: contentMentionsMock,
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
  organizationId: 'org-1',
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

  it('promotes Auto sends to image when the prompt is a generate request', async () => {
    const onSend = vi.fn();
    const { result } = renderHook(
      () =>
        useAgentChatInput({
          generationMode: 'auto',
          generationSettings: {
            aspectRatio: '1:1',
            outputs: 1,
          },
          onSend,
        }),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(result.current.editor).not.toBeNull();
    });
    act(() => {
      result.current.editor?.commands.setContent(
        'Generate an image of a red apple',
      );
    });
    await act(async () => {
      await result.current.handleSend();
    });

    expect(onSend).toHaveBeenCalledWith(
      'Generate an image of a red apple',
      undefined,
      undefined,
      expect.objectContaining({
        generationMode: 'image',
        generationSettings: {
          aspectRatio: '1:1',
          outputs: 1,
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
        isSkipped: true,
        thumbnailUrl: undefined,
        type: 'content',
      },
      {
        contentType: 'post',
        id: 'post-2',
        label: 'Campaign brief',
        isSkipped: true,
        thumbnailUrl: undefined,
        type: 'content',
      },
      { id: 'post-3', label: '^post:post-3', type: 'asset' },
    ]);

    await act(async () => {
      await result.current.handleSend();
    });

    // Legacy posts have no known canonical brand; only verified workspace
    // references can be sent until the posts are picked again.
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

describe('useAgentChatInput live content attach', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    microphoneState.isListening = false;
    brandSettings.settings.isVoiceControlEnabled = false;
  });

  it('shows a chip for a record attached to this scope while mounted, and focuses the editor at the end', async () => {
    const onSend = vi.fn();
    const { result } = renderHook(() => useAgentChatInput({ onSend }), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.editor).not.toBeNull();
    });
    expect(result.current.references).toEqual([
      { id: 'post-1', label: '^post:post-1', type: 'asset' },
      { id: 'post-3', label: '^post:post-3', type: 'asset' },
    ]);

    const editor = result.current.editor;
    expect(editor).not.toBeNull();
    if (!editor) {
      return;
    }

    // Move the caret away from the end so a subsequent end-focus is observable.
    act(() => {
      editor.commands.setContent('Half-written question');
      editor.commands.setTextSelection(1);
    });
    expect(editor.state.selection.from).toBe(1);

    act(() => {
      attachContentToConversationDraft(draftScopeKey, {
        contentTitle: 'Hero shot',
        contentType: 'image',
        id: 'ingredient-1',
        kind: 'ingredient',
      });
    });

    await waitFor(() => {
      expect(result.current.references).toEqual(
        expect.arrayContaining([
          {
            contentType: 'image',
            id: 'ingredient-1',
            label: 'Hero shot',
            thumbnailUrl: undefined,
            type: 'content',
          },
        ]),
      );
    });
    expect(editor.state.selection.from).toBe(
      TextSelection.atEnd(editor.state.doc).to,
    );
  });

  it('sends a live-attached record as an artifact reference with its kind and the organization id', async () => {
    const onSend = vi.fn();
    const { result } = renderHook(() => useAgentChatInput({ onSend }), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.editor).not.toBeNull();
    });

    act(() => {
      attachContentToConversationDraft(draftScopeKey, {
        contentTitle: 'Hero shot',
        contentType: 'image',
        id: 'ingredient-1',
        kind: 'ingredient',
      });
    });
    await waitFor(() => {
      expect(
        result.current.references.some((item) => item.id === 'ingredient-1'),
      ).toBe(true);
    });

    act(() => {
      result.current.editor?.commands.setContent('Use this shot');
    });
    await act(async () => {
      await result.current.handleSend();
    });

    // The attached record also rides along as a content mention, as picker
    // items always have.
    expect(onSend).toHaveBeenCalledWith(
      'Use this shot',
      [expect.objectContaining({ id: 'ingredient-1', type: 'content' })],
      undefined,
      expect.objectContaining({
        artifactReferences: expect.arrayContaining([
          expect.objectContaining({
            kind: 'ingredient',
            organizationId: 'org-1',
            recordId: 'ingredient-1',
            serializer: 'ingredient',
          }),
        ]),
      }),
    );
  });

  it('ignores a draft-updated event for a different scope', async () => {
    const { result } = renderHook(
      () => useAgentChatInput({ onSend: vi.fn() }),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(result.current.editor).not.toBeNull();
    });

    act(() => {
      attachContentToConversationDraft('other-scope', {
        contentTitle: 'Unrelated',
        contentType: 'post',
        id: 'post-unrelated',
      });
    });

    expect(
      result.current.references.some((item) => item.id === 'post-unrelated'),
    ).toBe(false);
  });
});

describe('useAgentChatInput surface artifact chip dismissal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    microphoneState.isListening = false;
    brandSettings.settings.isVoiceControlEnabled = false;
  });

  it('hides a dismissed surface chip, excludes it from send, and restores it after a successful send', async () => {
    const onSend = vi.fn();
    const { result } = renderHook(() => useAgentChatInput({ onSend }), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.editor).not.toBeNull();
    });
    expect(result.current.references).toEqual([
      { id: 'post-1', label: '^post:post-1', type: 'asset' },
      { id: 'post-3', label: '^post:post-3', type: 'asset' },
    ]);

    act(() => {
      result.current.handleRemoveReference({
        id: 'post-1',
        label: '^post:post-1',
        type: 'asset',
      });
    });

    expect(result.current.references).toEqual([
      { id: 'post-3', label: '^post:post-3', type: 'asset' },
    ]);

    act(() => {
      result.current.editor?.commands.setContent('Discuss the remaining asset');
    });
    await act(async () => {
      await result.current.handleSend();
    });

    expect(onSend).toHaveBeenCalledWith(
      'Discuss the remaining asset',
      undefined,
      undefined,
      expect.objectContaining({
        artifactReferences: [workspaceReferences[1]],
      }),
    );

    // A successful send resets dismissals for the next turn.
    expect(result.current.references).toEqual([
      { id: 'post-1', label: '^post:post-1', type: 'asset' },
      { id: 'post-3', label: '^post:post-3', type: 'asset' },
    ]);
  });

  it('accumulates dismissals in a composer without a draft scope', async () => {
    function UnscopedWrapper({ children }: { children: ReactNode }) {
      return (
        <ConversationComposerShellProvider
          artifactReferences={workspaceReferences}
          contextLabel="Workspace"
          draftScopeKey={null}
          portalTarget={null}
          shellState="canvas"
        >
          {children}
        </ConversationComposerShellProvider>
      );
    }
    const { result } = renderHook(
      () => useAgentChatInput({ onSend: vi.fn() }),
      { wrapper: UnscopedWrapper },
    );
    await waitFor(() => {
      expect(result.current.editor).not.toBeNull();
    });

    for (const id of ['post-1', 'post-3']) {
      act(() => {
        result.current.handleRemoveReference({
          id,
          label: `^post:${id}`,
          type: 'asset',
        });
      });
    }

    expect(result.current.references).toEqual([]);
  });

  it('keeps a dismissal when the composer remounts before sending', async () => {
    const first = renderHook(() => useAgentChatInput({ onSend: vi.fn() }), {
      wrapper: Wrapper,
    });
    await waitFor(() => {
      expect(first.result.current.editor).not.toBeNull();
    });
    act(() => {
      first.result.current.handleRemoveReference({
        id: 'post-1',
        label: '^post:post-1',
        type: 'asset',
      });
    });
    // An overlay taking the prompt bar remounts the composer.
    first.unmount();

    const second = renderHook(() => useAgentChatInput({ onSend: vi.fn() }), {
      wrapper: Wrapper,
    });
    await waitFor(() => {
      expect(second.result.current.editor).not.toBeNull();
    });

    expect(second.result.current.references).toEqual([
      { id: 'post-3', label: '^post:post-3', type: 'asset' },
    ]);
    writeDismissedSurfaceReferenceKeys(draftScopeKey, new Set());
  });
});

describe('useAgentChatInput attached record brand scope', () => {
  function BrandWrapper({ children }: { children: ReactNode }) {
    return (
      <ConversationComposerShellProvider
        brandId="brand-1"
        contextLabel="Studio"
        draftScopeKey={draftScopeKey}
        portalTarget={null}
        shellState="canvas"
      >
        {children}
      </ConversationComposerShellProvider>
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  async function sendWithAttached(brandId: string | undefined) {
    const onSend = vi.fn();
    const { result } = renderHook(() => useAgentChatInput({ onSend }), {
      wrapper: BrandWrapper,
    });
    await waitFor(() => {
      expect(result.current.editor).not.toBeNull();
    });
    act(() => {
      attachContentToConversationDraft(draftScopeKey, {
        ...(brandId ? { brandId } : {}),
        contentTitle: 'Hero shot',
        contentType: 'image',
        id: 'ingredient-1',
        kind: 'ingredient',
      });
    });
    await waitFor(() => {
      expect(
        result.current.references.some((item) => item.id === 'ingredient-1'),
      ).toBe(true);
    });
    act(() => {
      result.current.editor?.commands.setContent('Use this shot');
    });
    await act(async () => {
      await result.current.handleSend();
    });
    return onSend.mock.calls[0]?.[3] as
      | { artifactReferences?: AgentArtifactReference[] }
      | undefined;
  }

  it('sends a same-brand record with the brand it was attached from', async () => {
    const options = await sendWithAttached('brand-1');

    expect(options?.artifactReferences).toEqual([
      {
        brandId: 'brand-1',
        kind: 'ingredient',
        organizationId: 'org-1',
        recordId: 'ingredient-1',
        serializer: 'ingredient',
      },
    ]);
  });

  it('leaves out a record from another brand instead of relabelling it', async () => {
    const options = await sendWithAttached('brand-2');

    expect(options?.artifactReferences ?? []).toEqual([]);
  });

  it('leaves out a record with no known brand from a brand-bound composer', async () => {
    const options = await sendWithAttached(undefined);

    expect(options?.artifactReferences ?? []).toEqual([]);
  });
});

describe('useAgentChatInput picked post context', () => {
  function BoundWrapper({ children }: { children: ReactNode }) {
    return (
      <ConversationComposerShellProvider
        brandId="route-brand"
        contextLabel="Conversation"
        draftScopeKey={draftScopeKey}
        portalTarget={null}
        shellState="canvas"
      >
        {children}
      </ConversationComposerShellProvider>
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    storeState.activeThreadId = 'thread-1';
    storeState.threads = [{ id: 'thread-1', brandId: 'brand-1' }];
    microphoneState.isListening = false;
    microphoneState.isTranscribing = false;
  });

  afterEach(() => {
    storeState.activeThreadId = null;
    storeState.threads = [];
    sessionStorage.clear();
  });

  it.each(['brand-1', 'brand-2', null])(
    'sends successfully while including only matching picked posts (%s)',
    async (pickedBrandId) => {
      const onSend = vi.fn().mockResolvedValue(true);
      const { result } = renderHook(() => useAgentChatInput({ onSend }), {
        wrapper: BoundWrapper,
      });
      await waitFor(() => expect(result.current.editor).not.toBeNull());
      expect(contentMentionsMock).toHaveBeenLastCalledWith(null, 'brand-1');
      act(() => {
        result.current.handleSelectContentReference({
          brandId: pickedBrandId,
          contentTitle: 'Picked post',
          contentType: 'text',
          id: 'picked-post',
        });
        result.current.editor?.commands.setContent('Review this post');
      });
      expect(result.current.references[0]?.isSkipped ?? false).toBe(
        pickedBrandId !== 'brand-1',
      );
      await act(async () => {
        await result.current.handleSend();
      });
      expect(onSend).toHaveBeenCalledTimes(1);
      const options = onSend.mock.calls[0]?.[3];
      expect(options.artifactReferences ?? []).toEqual(
        pickedBrandId === 'brand-1'
          ? [
              {
                brandId: 'brand-1',
                kind: 'post',
                organizationId: 'org-1',
                recordId: 'picked-post',
                serializer: 'post',
              },
            ]
          : [],
      );
      expect(options.brandId).toBe('brand-1');
      expect(result.current.editor?.getText()).toBe('');
    },
  );

  it('uses organization scope for an unbound conversation even on a brand route', async () => {
    storeState.threads = [{ id: 'thread-1', brandId: null }];
    const onSend = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useAgentChatInput({ onSend }), {
      wrapper: BoundWrapper,
    });
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    expect(contentMentionsMock).toHaveBeenLastCalledWith(null, undefined);
    act(() => {
      for (const brandId of ['brand-2', null]) {
        result.current.handleSelectContentReference({
          brandId,
          contentTitle: 'Post',
          contentType: 'text',
          id: `post-${brandId}`,
        });
      }
      result.current.editor?.commands.setContent('Compare these');
    });
    await act(async () => {
      await result.current.handleSend();
    });
    expect(onSend.mock.calls[0]?.[3]).toMatchObject({
      artifactReferences: [
        { brandId: 'brand-2', kind: 'post', recordId: 'post-brand-2' },
        { kind: 'post', recordId: 'post-null' },
      ],
    });
    expect(onSend.mock.calls[0]?.[3].brandId).toBeUndefined();
  });
});
