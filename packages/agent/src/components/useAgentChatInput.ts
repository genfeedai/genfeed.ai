import type { AgentChatReferenceItem } from '@genfeedai/agent/components/AgentChatInputAttachmentTray';
import { BrandMentionList } from '@genfeedai/agent/components/BrandMentionList';
import { ContentMentionList } from '@genfeedai/agent/components/ContentMentionList';
import { useConversationComposerShell } from '@genfeedai/agent/components/ConversationComposerShellContext';
import { CredentialMentionList } from '@genfeedai/agent/components/CredentialMentionList';
import { TeamMentionList } from '@genfeedai/agent/components/TeamMentionList';
import { parseConversationComposerCommand } from '@genfeedai/agent/constants/conversation-composer-actions.constant';
import { BrandMention } from '@genfeedai/agent/extensions/brand-mention.extension';
import { ContentMention } from '@genfeedai/agent/extensions/content-mention.extension';
import { CredentialMention } from '@genfeedai/agent/extensions/credential-mention.extension';
import { SlashCommands } from '@genfeedai/agent/extensions/slash-commands.extension';
import { TeamMention } from '@genfeedai/agent/extensions/team-mention.extension';
import { useBrandMentions } from '@genfeedai/agent/hooks/use-brand-mentions';
import { useContentMentions } from '@genfeedai/agent/hooks/use-content-mentions';
import { useCredentialMentions } from '@genfeedai/agent/hooks/use-credential-mentions';
import { useMicrophoneInput } from '@genfeedai/agent/hooks/use-microphone-input';
import { useTeamMentions } from '@genfeedai/agent/hooks/use-team-mentions';
import type {
  ConversationComposerActionName,
  ConversationComposerArtifactReference,
  ConversationComposerSendOptions,
} from '@genfeedai/agent/models/conversation-composer.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import {
  clearConversationComposerDraft,
  readConversationComposerDraft,
  writeConversationComposerDocument,
  writeConversationComposerFocusIntent,
} from '@genfeedai/agent/stores/conversation-composer-draft.store';
import type { AgentArtifactReference } from '@genfeedai/interfaces';
import type {
  AttachmentItem,
  ChatAttachment,
  DragHandlers,
  DragState,
} from '@genfeedai/props/ui/attachments.props';
import { type Editor, Extension, type JSONContent } from '@tiptap/core';
import type { MentionNodeAttrs } from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { ReactRenderer, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { SuggestionProps } from '@tiptap/suggestion';
import {
  type ClipboardEvent,
  type ComponentType,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import tippy, { type Instance } from 'tippy.js';
import type { ExtractedMention } from './AgentChatInput';

const EMPTY_SURFACE_ARTIFACT_REFERENCES: readonly (
  | AgentArtifactReference
  | ConversationComposerArtifactReference
)[] = [];

function normalizeSurfaceArtifactReference(
  item: AgentArtifactReference | ConversationComposerArtifactReference,
): ConversationComposerArtifactReference {
  if ('reference' in item) {
    return item;
  }

  return {
    label: `^${item.kind}:${item.recordId}`,
    reference: item,
  };
}

// ---------------------------------------------------------------------------
// Pure helpers (no JSX — safe in .ts file)
// ---------------------------------------------------------------------------

function extractMentions(json: JSONContent): ExtractedMention[] {
  const result: ExtractedMention[] = [];

  function walk(node: JSONContent) {
    if (node.attrs) {
      switch (node.type) {
        case 'brandMention':
          result.push({
            brandName: node.attrs.brandName as string,
            brandSlug: node.attrs.brandSlug as string,
            id: node.attrs.brandId as string,
            type: 'brand',
          });
          break;
        case 'teamMention':
          result.push({
            displayName: node.attrs.displayName as string,
            id: node.attrs.userId as string,
            isAgent: node.attrs.isAgent as boolean,
            role: node.attrs.role as string,
            type: 'team',
          });
          break;
        case 'credentialMention':
          result.push({
            handle: node.attrs.handle as string,
            id: node.attrs.id as string,
            platform: node.attrs.platform as string,
            type: 'credential',
          });
          break;
        case 'contentMention':
          result.push({
            contentTitle: node.attrs.contentTitle as string,
            contentType: node.attrs.contentType as string,
            id: node.attrs.contentId as string,
            type: 'content',
          });
          break;
      }
    }
    if (node.content) {
      for (const child of node.content) {
        walk(child);
      }
    }
  }

  walk(json);
  return result;
}

const SendOnEnter = Extension.create({
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const event = new CustomEvent('agent-chat-send');
        document.dispatchEvent(event);
        return true;
      },
    };
  },
  name: 'sendOnEnter',
});

type MentionSuggestionRenderProps = SuggestionProps<unknown, MentionNodeAttrs>;

function getMentionClientRect(
  props: MentionSuggestionRenderProps,
): () => DOMRect {
  return () => props.clientRect?.() ?? new DOMRect();
}

function buildMentionSuggestion<T>({
  component,
  getItems,
}: {
  component: ComponentType<{ items: T[]; command: (item: T) => void }>;
  getItems: (query: string) => T[];
}) {
  return {
    items: ({ query }: { query: string }) => getItems(query),
    render: () => {
      let reactRenderer: ReactRenderer;
      let popup: Instance[];

      return {
        onExit: () => {
          if (popup[0]) {
            popup[0].destroy();
          }
          reactRenderer.destroy();
        },
        onKeyDown: (props: { event: KeyboardEvent }) => {
          if (props.event.key === 'Escape') {
            if (popup[0]) {
              popup[0].hide();
            }
            return true;
          }
          return (
            (
              reactRenderer.ref as {
                onKeyDown: (p: { event: KeyboardEvent }) => boolean;
              }
            )?.onKeyDown(props) ?? false
          );
        },
        onStart: (props: MentionSuggestionRenderProps) => {
          reactRenderer = new ReactRenderer(
            component as ComponentType<Record<string, unknown>>,
            {
              editor: props.editor,
              props,
            },
          );
          popup = tippy('body', {
            appendTo: () => document.body,
            content: reactRenderer.element,
            getReferenceClientRect: getMentionClientRect(props),
            interactive: true,
            placement: 'bottom-start',
            showOnCreate: true,
            trigger: 'manual',
          });
        },
        onUpdate: (props: MentionSuggestionRenderProps) => {
          reactRenderer.updateProps(props);
          if (popup[0]) {
            popup[0].setProps({
              getReferenceClientRect: getMentionClientRect(props),
            });
          }
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Hook params — mirror the public props that drive logic
// ---------------------------------------------------------------------------

interface UseAgentChatInputParams {
  onSend: (
    content: string,
    mentions?: ExtractedMention[],
    attachments?: ChatAttachment[],
    options?: ConversationComposerSendOptions,
  ) => void;
  onStop?: () => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  apiService?: AgentApiService;
  showStop?: boolean;
  attachments?: AttachmentItem[];
  dragState?: DragState;
  dragHandlers?: DragHandlers;
  addFiles?: (files: File[]) => void;
  removeAttachment?: (id: string) => void;
  getCompletedAttachments?: () => ChatAttachment[];
  clearAllAttachments?: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAgentChatInput({
  onSend,
  disabled,
  placeholder = 'Type # brands, @ team, ! accounts, ^ content, / commands',
  apiService,
  showStop = false,
  attachments = [],
  dragState,
  addFiles,
  removeAttachment,
  getCompletedAttachments,
  clearAllAttachments,
}: UseAgentChatInputParams) {
  const composerShell = useConversationComposerShell();
  const surfaceArtifactReferences =
    composerShell?.artifactReferences ?? EMPTY_SURFACE_ARTIFACT_REFERENCES;
  const draftScopeKey = composerShell?.draftScopeKey ?? null;
  const restoredDraft = useMemo(
    () => readConversationComposerDraft(draftScopeKey),
    [draftScopeKey],
  );
  const activeThreadId = useAgentChatStore((s) => s.activeThreadId);
  const composerSeed = useAgentChatStore((s) => s.composerSeed);
  const clearComposerSeed = useAgentChatStore((s) => s.clearComposerSeed);

  const { mentions: credentialMentions } = useCredentialMentions(
    apiService ?? null,
  );
  const { mentions: brandMentions } = useBrandMentions();
  const { mentions: teamMentions } = useTeamMentions(apiService ?? null);
  const { mentions: contentMentions } = useContentMentions(apiService ?? null);

  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [isEmpty, setIsEmpty] = useState(!restoredDraft.plainText.trim());
  const [mentionReferences, setMentionReferences] = useState<
    AgentChatReferenceItem[]
  >(() =>
    restoredDraft.document
      ? extractMentions(restoredDraft.document).map((mention) => ({
          id: mention.id,
          label:
            mention.type === 'brand'
              ? `#${mention.brandName}`
              : mention.type === 'team'
                ? `@${mention.displayName}`
                : mention.type === 'credential'
                  ? `!${mention.handle}`
                  : `^${mention.contentTitle}`,
          type: mention.type,
        }))
      : [],
  );
  const editorRef = useRef<Editor | null>(null);

  const hasAttachments = attachments.length > 0;
  const hasCompletedAttachments =
    getCompletedAttachments !== undefined &&
    getCompletedAttachments().length > 0;

  const handleTranscript = useCallback((text: string) => {
    const ed = editorRef.current;
    if (ed) {
      ed.commands.setContent(text);
      ed.commands.focus('end');
    }
  }, []);

  const {
    isListening,
    isSupported,
    isTranscribing,
    startListening,
    stopListening,
  } = useMicrophoneInput({
    apiBaseUrl: apiService?.baseUrl ?? '',
    getToken: apiService
      ? () => apiService.getToken()
      : () => Promise.resolve(null),
    onTranscript: handleTranscript,
  });

  const editor = useEditor({
    content: restoredDraft.document ?? undefined,
    editorProps: {
      attributes: {
        'aria-label': 'Conversation prompt',
        'aria-multiline': 'true',
        class:
          'prose prose-sm prose-invert max-w-none flex-1 bg-transparent py-1.5 text-sm text-foreground focus:outline-none',
        role: 'textbox',
      },
    },
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        listItem: false,
        orderedList: false,
      }),
      Placeholder.configure({
        placeholder,
      }),
      BrandMention.configure({
        HTMLAttributes: { class: 'mention mention-brand' },
        renderText({ node }) {
          return `#${node.attrs.label ?? node.attrs.brandName}`;
        },
        suggestion: buildMentionSuggestion({
          component: BrandMentionList,
          getItems: (query) =>
            brandMentions.filter((item) =>
              item.brandName.toLowerCase().includes(query.toLowerCase()),
            ),
        }),
      }),
      TeamMention.configure({
        HTMLAttributes: { class: 'mention mention-team' },
        renderText({ node }) {
          return `@${node.attrs.label ?? node.attrs.displayName}`;
        },
        suggestion: buildMentionSuggestion({
          component: TeamMentionList,
          getItems: (query) =>
            teamMentions.filter((item) =>
              item.displayName.toLowerCase().includes(query.toLowerCase()),
            ),
        }),
      }),
      CredentialMention.configure({
        HTMLAttributes: { class: 'mention mention-credential' },
        renderText({ node }) {
          return `!${node.attrs.label ?? node.attrs.handle}`;
        },
        suggestion: buildMentionSuggestion({
          component: CredentialMentionList,
          getItems: (query) =>
            credentialMentions.filter(
              (item) =>
                item.handle.toLowerCase().includes(query.toLowerCase()) ||
                item.name.toLowerCase().includes(query.toLowerCase()),
            ),
        }),
      }),
      ContentMention.configure({
        HTMLAttributes: { class: 'mention mention-content' },
        renderText({ node }) {
          return `^${node.attrs.label ?? node.attrs.contentTitle}`;
        },
        suggestion: buildMentionSuggestion({
          component: ContentMentionList,
          getItems: (query) =>
            contentMentions.filter((item) =>
              item.contentTitle.toLowerCase().includes(query.toLowerCase()),
            ),
        }),
      }),
      SlashCommands,
      SendOnEnter,
    ],
    immediatelyRender: false,
  });

  // Track editor state and keep the tab-scoped reload draft current.
  useEffect(() => {
    if (!editor) {
      return;
    }
    const updateHandler = () => {
      setIsEmpty(editor.isEmpty);
      const document = editor.getJSON();
      const nextReferences = extractMentions(document).map((mention) => ({
        id: mention.id,
        label:
          mention.type === 'brand'
            ? `#${mention.brandName}`
            : mention.type === 'team'
              ? `@${mention.displayName}`
              : mention.type === 'credential'
                ? `!${mention.handle}`
                : `^${mention.contentTitle}`,
        type: mention.type,
      }));
      setMentionReferences(nextReferences);
      writeConversationComposerDocument(
        draftScopeKey,
        document,
        editor.getText(),
      );
      setActionFeedback(null);
    };
    const focusHandler = () => {
      writeConversationComposerFocusIntent(draftScopeKey, true);
    };
    const blurHandler = ({ event }: { event: FocusEvent }) => {
      if (event.relatedTarget) {
        writeConversationComposerFocusIntent(draftScopeKey, false);
      }
    };
    editor.on('update', updateHandler);
    editor.on('focus', focusHandler);
    editor.on('blur', blurHandler);
    return () => {
      editor.off('update', updateHandler);
      editor.off('focus', focusHandler);
      editor.off('blur', blurHandler);
    };
  }, [draftScopeKey, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const draft = readConversationComposerDraft(draftScopeKey);
    editor.commands.setContent(draft.document ?? '');
    setIsEmpty(!draft.plainText.trim());
    setMentionReferences(
      draft.document
        ? extractMentions(draft.document).map((mention) => ({
            id: mention.id,
            label:
              mention.type === 'brand'
                ? `#${mention.brandName}`
                : mention.type === 'team'
                  ? `@${mention.displayName}`
                  : mention.type === 'credential'
                    ? `!${mention.handle}`
                    : `^${mention.contentTitle}`,
            type: mention.type,
          }))
        : [],
    );

    if (!draft.hasFocusIntent) {
      return;
    }

    const focusFrame = window.requestAnimationFrame(() => {
      if (!editor.isDestroyed) {
        editor.commands.focus('end');
      }
    });

    return () => window.cancelAnimationFrame(focusFrame);
  }, [draftScopeKey, editor]);

  // Keep editorRef in sync for the microphone callback
  useEffect(() => {
    editorRef.current = editor ?? null;
  }, [editor]);

  useEffect(() => {
    if (!editor || !composerSeed) {
      return;
    }

    const matchesThread =
      composerSeed.threadId === null ||
      composerSeed.threadId === activeThreadId;

    if (!matchesThread) {
      return;
    }

    editor.commands.setContent(composerSeed.content);
    editor.commands.focus('end');
    clearComposerSeed();
  }, [activeThreadId, clearComposerSeed, composerSeed, editor]);

  // Sync disabled state
  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
      editor.view.dom.setAttribute('aria-disabled', String(Boolean(disabled)));
    }
  }, [editor, disabled]);

  const handleSend = useCallback(async () => {
    if (!editor || disabled) {
      return;
    }
    const text = editor.getText().trim();
    const canSend = Boolean(text) || hasCompletedAttachments;
    if (!canSend) {
      return;
    }
    const parsedCommand = parseConversationComposerCommand(text);
    if (parsedCommand.kind === 'unknown') {
      setActionFeedback(
        `Unknown command /${parsedCommand.command.command}. Choose a trusted action from the Actions menu.`,
      );
      return;
    }
    if (parsedCommand.kind === 'action') {
      if (!composerShell?.dispatchAction) {
        setActionFeedback(
          'This action is unavailable here. Your draft has been preserved.',
        );
        return;
      }

      try {
        const result = await composerShell.dispatchAction(
          parsedCommand.invocation,
        );
        setActionFeedback(result.message);
      } catch {
        setActionFeedback(
          'That action could not be opened. Your draft and references are unchanged.',
        );
      }
      return;
    }

    const json = editor.getJSON();
    const mentionData = extractMentions(json);
    const completed = getCompletedAttachments?.();
    onSend(
      text,
      mentionData.length > 0 ? mentionData : undefined,
      completed && completed.length > 0 ? completed : undefined,
      {
        ...(surfaceArtifactReferences.length > 0
          ? {
              artifactReferences: surfaceArtifactReferences.map(
                (item) => normalizeSurfaceArtifactReference(item).reference,
              ),
            }
          : {}),
        ...(composerShell?.brandId ? { brandId: composerShell.brandId } : {}),
        planModeEnabled: false,
      },
    );
    editor.commands.clearContent();
    clearAllAttachments?.();
    clearConversationComposerDraft(draftScopeKey);
  }, [
    composerShell,
    draftScopeKey,
    editor,
    disabled,
    onSend,
    hasCompletedAttachments,
    getCompletedAttachments,
    clearAllAttachments,
    surfaceArtifactReferences,
  ]);

  // Handle Enter after handleSend is stable so keyboard and click paths share
  // the same trusted-command checks and recovery behavior.
  useEffect(() => {
    function handleSendEvent() {
      void handleSend();
    }

    document.addEventListener('agent-chat-send', handleSendEvent);
    return () =>
      document.removeEventListener('agent-chat-send', handleSendEvent);
  }, [handleSend]);

  const handleSelectAction = useCallback(
    (actionName: ConversationComposerActionName) => {
      if (!editor) {
        return;
      }

      if (editor.isEmpty) {
        editor.commands.setContent(`/${actionName} `);
      } else {
        editor.chain().focus('start').insertContent(`/${actionName} `).run();
      }
      editor.commands.focus('end');
    },
    [editor],
  );

  const handleInsertReference = useCallback(() => {
    editor?.chain().focus('end').insertContent('^').run();
  }, [editor]);

  const handleShellPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (
        !target ||
        target.closest(
          'button, a, input, select, textarea, [contenteditable="true"]',
        )
      ) {
        return;
      }

      editor?.commands.focus('end');
    },
    [editor],
  );

  const handlePasteImages = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (!addFiles) {
        return;
      }

      const files = Array.from(event.clipboardData.files ?? []).filter(
        (file) =>
          file.type.startsWith('image/') ||
          file.type.startsWith('video/') ||
          file.type.startsWith('audio/'),
      );

      if (files.length === 0) {
        return;
      }

      event.preventDefault();
      addFiles(files);
    },
    [addFiles],
  );

  const handleRemoveAttachment = useCallback(
    (assetId: string) => {
      removeAttachment?.(assetId);
    },
    [removeAttachment],
  );

  const references = useMemo<AgentChatReferenceItem[]>(() => {
    const referencesByKey = new Map<string, AgentChatReferenceItem>();

    for (const reference of composerShell?.references ?? []) {
      referencesByKey.set(`${reference.kind}:${reference.id}`, {
        id: reference.id,
        label: reference.label,
        type: reference.kind,
      });
    }
    for (const reference of mentionReferences) {
      referencesByKey.set(`${reference.type}:${reference.id}`, reference);
    }

    return [...referencesByKey.values()];
  }, [composerShell?.references, mentionReferences]);
  const displayedReferences = useMemo<AgentChatReferenceItem[]>(() => {
    const referencesById = new Map<string, AgentChatReferenceItem>();

    for (const reference of references) {
      if (!referencesById.has(reference.id)) {
        referencesById.set(reference.id, reference);
      }
    }

    for (const item of surfaceArtifactReferences) {
      const normalizedItem = normalizeSurfaceArtifactReference(item);
      const referenceId = normalizedItem.reference.recordId;
      if (!referencesById.has(referenceId)) {
        referencesById.set(referenceId, {
          id: referenceId,
          label: normalizedItem.label,
          type: 'asset',
        });
      }
    }

    return [...referencesById.values()];
  }, [references, surfaceArtifactReferences]);

  const isDragActive = dragState?.isActive ?? false;
  const canSendMessage = !isEmpty || hasCompletedAttachments;

  const shouldShowVoiceInput =
    !showStop &&
    !isListening &&
    !isTranscribing &&
    isSupported &&
    isEmpty &&
    !hasAttachments;
  const shouldShowSendButton =
    !showStop &&
    !isTranscribing &&
    (!isSupported || !isEmpty || hasCompletedAttachments);

  return {
    actionFeedback,
    canSendMessage,
    editor,
    handlePasteImages,
    handleRemoveAttachment,
    handleInsertReference,
    handleSelectAction,
    handleSend,
    handleShellPointerDown,
    hasAttachments,
    isDragActive,
    isListening,
    isTranscribing,
    references: displayedReferences,
    shouldShowSendButton,
    shouldShowVoiceInput,
    startListening,
    stopListening,
  };
}
