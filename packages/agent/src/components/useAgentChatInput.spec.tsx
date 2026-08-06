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

describe('useAgentChatInput references', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
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

    expect(result.current.references).toEqual([
      { id: 'post-1', label: '^Launch post', type: 'content' },
      { id: 'post-2', label: '^Campaign brief', type: 'content' },
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
