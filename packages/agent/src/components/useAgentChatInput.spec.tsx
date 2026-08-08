import { ConversationComposerShellProvider } from '@genfeedai/agent/components/ConversationComposerShellContext';
import {
  areAgentChatMentionReferencesEqual,
  useAgentChatInput,
} from '@genfeedai/agent/components/useAgentChatInput';
import { writeConversationComposerDocument } from '@genfeedai/agent/stores/conversation-composer-draft.store';
import type { AgentArtifactReference } from '@genfeedai/interfaces';
import { act, renderHook, waitFor } from '@testing-library/react';
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
