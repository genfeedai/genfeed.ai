import type { AgentChatReferenceItem } from '@genfeedai/agent/components/AgentChatInputAttachmentTray';
import {
  areAgentChatMentionReferencesEqual,
  buildMentionSuggestion,
  extractMentions,
  mapMentionsToReferences,
  SendOnEnter,
} from '@genfeedai/agent/components/agent-chat-input.mentions';
import { BrandMentionList } from '@genfeedai/agent/components/BrandMentionList';
import { useConversationComposerShell } from '@genfeedai/agent/components/ConversationComposerShellContext';
import { CredentialMentionList } from '@genfeedai/agent/components/CredentialMentionList';
import { TeamMentionList } from '@genfeedai/agent/components/TeamMentionList';
import { parseConversationComposerCommand } from '@genfeedai/agent/constants/conversation-composer-actions.constant';
import { BrandMention } from '@genfeedai/agent/extensions/brand-mention.extension';
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
  PersistedConversationComposerContentReference,
} from '@genfeedai/agent/models/conversation-composer.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import {
  clearConversationComposerDraft,
  readConversationComposerDraft,
  writeConversationComposerContentReferences,
  writeConversationComposerDocument,
  writeConversationComposerFocusIntent,
} from '@genfeedai/agent/stores/conversation-composer-draft.store';
import type { ContentMentionItem } from '@genfeedai/agent/types/mention.types';
import { normalizeComposerPasteText } from '@genfeedai/agent/utils/normalize-composer-paste.util';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import type { AgentArtifactReference } from '@genfeedai/interfaces';
import type {
  AttachmentItem,
  ChatAttachment,
  DragHandlers,
  DragState,
} from '@genfeedai/props/ui/attachments.props';
import type { Editor, JSONContent } from '@tiptap/core';
import Placeholder from '@tiptap/extension-placeholder';
import { Fragment, Slice } from '@tiptap/pm/model';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  type ClipboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ExtractedMention } from './AgentChatInput';

function contentReferenceToTrayItem(
  item: PersistedConversationComposerContentReference,
): AgentChatReferenceItem {
  return {
    contentType: item.contentType,
    id: item.id,
    label: item.contentTitle,
    thumbnailUrl: item.thumbnailUrl,
    type: 'content',
  };
}

function contentReferenceToMention(
  item: PersistedConversationComposerContentReference,
): ExtractedMention {
  return {
    contentTitle: item.contentTitle,
    contentType: item.contentType,
    id: item.id,
    type: 'content',
  };
}

/** Strip legacy inline contentMention nodes from restored drafts. */
function stripContentMentionNodes(document: JSONContent): JSONContent {
  function walk(node: JSONContent): JSONContent | null {
    if (node.type === 'contentMention') {
      return null;
    }

    if (!node.content?.length) {
      return node;
    }

    const nextContent = node.content
      .map((child) => walk(child))
      .filter((child): child is JSONContent => child !== null);

    return { ...node, content: nextContent };
  }

  return walk(document) ?? { type: 'doc', content: [{ type: 'paragraph' }] };
}

function migrateLegacyContentMentions(
  document: JSONContent | null,
  existing: readonly PersistedConversationComposerContentReference[],
): PersistedConversationComposerContentReference[] {
  if (!document) {
    return [...existing];
  }

  const byId = new Map(existing.map((item) => [item.id, item] as const));
  for (const mention of extractMentions(document)) {
    if (mention.type !== 'content' || byId.has(mention.id)) {
      continue;
    }
    byId.set(mention.id, {
      contentTitle: mention.contentTitle,
      contentType: mention.contentType,
      id: mention.id,
    });
  }

  return [...byId.values()];
}

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

export {
  areAgentChatMentionReferencesEqual,
  extractMentions,
  mapMentionsToReferences,
};

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

export function useAgentChatInput({
  onSend,
  disabled,
  placeholder: placeholderOverride,
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
  // Org "Voice Control" (admin setting, default false). Matches studio PromptBar
  // gating so in-app STT is opt-in; Wispr / OS dictation still types into the field.
  const { settings: organizationSettings } = useBrand();
  const isVoiceControlEnabled =
    organizationSettings?.isVoiceControlEnabled === true;
  const surfaceArtifactReferences =
    composerShell?.artifactReferences ?? EMPTY_SURFACE_ARTIFACT_REFERENCES;
  const draftScopeKey = composerShell?.draftScopeKey ?? null;
  const restoredDraft = useMemo(
    () => readConversationComposerDraft(draftScopeKey),
    [draftScopeKey],
  );
  const activeThreadId = useAgentChatStore((s) => s.activeThreadId);
  const composerSeed = useAgentChatStore((s) => s.composerSeed);
  const placeholder =
    placeholderOverride ?? 'Ask for help with content, review, or planning…';
  const placeholderRef = useRef(placeholder);
  // TipTap reads this on each placeholder paint — sync after commit only.
  useLayoutEffect(() => {
    placeholderRef.current = placeholder;
  }, [placeholder]);

  const clearComposerSeed = useAgentChatStore((s) => s.clearComposerSeed);

  const { mentions: credentialMentions } = useCredentialMentions(
    apiService ?? null,
  );
  const { mentions: brandMentions } = useBrandMentions();
  const { mentions: teamMentions } = useTeamMentions(apiService ?? null);
  const { isLoading: isContentLibraryLoading, mentions: contentLibraryItems } =
    useContentMentions(apiService ?? null);

  const initialContentReferences = useMemo(
    () =>
      migrateLegacyContentMentions(
        restoredDraft.document,
        restoredDraft.contentReferences,
      ),
    [restoredDraft.contentReferences, restoredDraft.document],
  );

  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [isEmpty, setIsEmpty] = useState(!restoredDraft.plainText.trim());
  const [isContentPickerOpen, setIsContentPickerOpen] = useState(false);
  const [contentReferences, setContentReferences] = useState<
    PersistedConversationComposerContentReference[]
  >(initialContentReferences);
  const [mentionReferences, setMentionReferences] = useState<
    AgentChatReferenceItem[]
  >(() =>
    restoredDraft.document
      ? mapMentionsToReferences(extractMentions(restoredDraft.document))
      : [],
  );
  const editorRef = useRef<Editor | null>(null);
  // Stable bridge so the module-scope SendOnEnter keymap can invoke the live,
  // component-scoped handleSend without recreating the editor.
  const handleSendRef = useRef<() => void>(() => {});

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

  const initialEditorContent = useMemo(() => {
    if (!restoredDraft.document) {
      return undefined;
    }
    return stripContentMentionNodes(restoredDraft.document);
  }, [restoredDraft.document]);

  const editor = useEditor({
    content: initialEditorContent,
    editorProps: {
      attributes: {
        'aria-label': 'Conversation prompt',
        'aria-multiline': 'true',
        class:
          'prose prose-sm prose-invert max-w-none flex-1 bg-transparent py-1.5 text-sm text-foreground focus:outline-none',
        role: 'textbox',
      },
      // Prefer plain text and collapse soft line wraps. HTML paste from chat
      // bubbles / browsers often injects a hard break per visual line.
      handlePaste: (view, event) => {
        const clipboard = event.clipboardData;
        if (!clipboard) {
          return false;
        }

        const hasFiles = Array.from(clipboard.files ?? []).some(
          (file) =>
            file.type.startsWith('image/') ||
            file.type.startsWith('video/') ||
            file.type.startsWith('audio/'),
        );
        if (hasFiles) {
          // File paste is handled by the outer shell; suppress ProseMirror's
          // default path so fallback text/HTML does not also insert.
          event.preventDefault();
          return true;
        }

        const plain = clipboard.getData('text/plain');
        if (!plain) {
          return false;
        }

        const normalized = normalizeComposerPasteText(plain);
        event.preventDefault();
        if (!normalized) {
          return true;
        }

        const { state, dispatch } = view;
        const { from, to } = state.selection;
        const parts = normalized.split('\n\n');
        const paragraphType = state.schema.nodes.paragraph;

        if (!paragraphType || parts.length === 1) {
          dispatch(state.tr.insertText(normalized, from, to));
          return true;
        }

        const nodes = parts.map((part) =>
          paragraphType.create(
            null,
            part.length > 0 ? state.schema.text(part) : undefined,
          ),
        );
        const slice = new Slice(Fragment.fromArray(nodes), 0, 0);
        dispatch(state.tr.replaceRange(from, to, slice));
        return true;
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
        placeholder: () => placeholderRef.current,
      }),
      SendOnEnter.configure({
        onEnter: () => {
          handleSendRef.current();
          return true;
        },
      }),
      BrandMention.configure({
        HTMLAttributes: { class: 'mention mention-brand' },
        renderText({ node }) {
          return `#${node.attrs.label ?? node.attrs.brandName}`;
        },
        suggestion: {
          char: '#',
          ...buildMentionSuggestion({
            component: BrandMentionList,
            getItems: (query) =>
              brandMentions.filter((item) =>
                item.brandName.toLowerCase().includes(query.toLowerCase()),
              ),
          }),
        },
      }),
      TeamMention.configure({
        HTMLAttributes: { class: 'mention mention-team' },
        renderText({ node }) {
          return `@${node.attrs.label ?? node.attrs.displayName}`;
        },
        suggestion: {
          char: '@',
          ...buildMentionSuggestion({
            component: TeamMentionList,
            getItems: (query) =>
              teamMentions.filter((item) =>
                item.displayName.toLowerCase().includes(query.toLowerCase()),
              ),
          }),
        },
      }),
      CredentialMention.configure({
        HTMLAttributes: { class: 'mention mention-credential' },
        renderText({ node }) {
          return `!${node.attrs.label ?? node.attrs.handle}`;
        },
        suggestion: {
          char: '!',
          ...buildMentionSuggestion({
            component: CredentialMentionList,
            getItems: (query) =>
              credentialMentions.filter(
                (item) =>
                  item.handle.toLowerCase().includes(query.toLowerCase()) ||
                  item.name.toLowerCase().includes(query.toLowerCase()),
              ),
          }),
        },
      }),
      SlashCommands,
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
      const nextReferences = mapMentionsToReferences(extractMentions(document));
      // Editor fires on every keystroke; only promote mention state when the
      // chip list actually changes so the attachment tray / toolbar stay still.
      setMentionReferences((current) =>
        areAgentChatMentionReferencesEqual(current, nextReferences)
          ? current
          : nextReferences,
      );
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
    const migratedContentReferences = migrateLegacyContentMentions(
      draft.document,
      draft.contentReferences,
    );
    const cleanedDocument = draft.document
      ? stripContentMentionNodes(draft.document)
      : '';
    editor.commands.setContent(cleanedDocument);
    setIsEmpty(!draft.plainText.trim());
    setContentReferences(migratedContentReferences);
    writeConversationComposerContentReferences(
      draftScopeKey,
      migratedContentReferences,
    );
    const nextReferences = draft.document
      ? mapMentionsToReferences(extractMentions(draft.document))
      : [];
    setMentionReferences((current) =>
      areAgentChatMentionReferencesEqual(current, nextReferences)
        ? current
        : nextReferences,
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

  // Refresh the empty-state placeholder after editor state changes.
  useEffect(() => {
    if (!editor?.isEmpty) {
      return;
    }
    editor.view.dispatch(editor.state.tr);
  }, [editor]);

  const handleSend = useCallback(async () => {
    if (!editor || disabled) {
      return;
    }
    // Mic is exclusive with send: while listening, Enter must not post text
    // with a missing send affordance (stop-listening owns the trailing slot).
    if (isListening || isTranscribing) {
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
    const mentionData = [
      ...extractMentions(json).filter((mention) => mention.type !== 'content'),
      ...contentReferences.map(contentReferenceToMention),
    ];
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
    setContentReferences([]);
    clearAllAttachments?.();
    clearConversationComposerDraft(draftScopeKey);
  }, [
    composerShell,
    contentReferences,
    draftScopeKey,
    editor,
    disabled,
    isListening,
    isTranscribing,
    onSend,
    hasCompletedAttachments,
    getCompletedAttachments,
    clearAllAttachments,
    surfaceArtifactReferences,
  ]);

  // Keep the SendOnEnter keymap pointed at the latest handleSend so the Enter
  // and Send-button paths share the same trusted-command checks and recovery.
  useEffect(() => {
    handleSendRef.current = () => {
      void handleSend();
    };
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
    setIsContentPickerOpen(true);
  }, []);

  const handleSelectContentReference = useCallback(
    (item: ContentMentionItem) => {
      setContentReferences((current) => {
        if (current.some((reference) => reference.id === item.id)) {
          return current;
        }

        const next: PersistedConversationComposerContentReference[] = [
          ...current,
          {
            contentTitle: item.contentTitle,
            contentType: item.contentType,
            id: item.id,
            ...(item.thumbnailUrl ? { thumbnailUrl: item.thumbnailUrl } : {}),
          },
        ];
        writeConversationComposerContentReferences(draftScopeKey, next);
        return next;
      });
      setIsContentPickerOpen(false);
      editor?.commands.focus('end');
    },
    [draftScopeKey, editor],
  );

  const handleRemoveContentReference = useCallback(
    (referenceId: string) => {
      setContentReferences((current) => {
        const next = current.filter((item) => item.id !== referenceId);
        writeConversationComposerContentReferences(draftScopeKey, next);
        return next;
      });
    },
    [draftScopeKey],
  );

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

  const handleRemoveReference = useCallback(
    (reference: AgentChatReferenceItem) => {
      if (reference.type === 'content') {
        handleRemoveContentReference(reference.id);
      }
    },
    [handleRemoveContentReference],
  );

  const selectedContentIds = useMemo(
    () => new Set(contentReferences.map((item) => item.id)),
    [contentReferences],
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
    for (const reference of contentReferences) {
      referencesByKey.set(
        `content:${reference.id}`,
        contentReferenceToTrayItem(reference),
      );
    }

    return [...referencesByKey.values()];
  }, [composerShell?.references, contentReferences, mentionReferences]);
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

  // Empty composer = no text and no ready attachments.
  const isEmptyComposer = isEmpty && !hasCompletedAttachments;

  // Org Voice Control + browser MediaRecorder. When both are true and the
  // field is empty, mic *replaces* the send button on the trailing edge.
  const canUseVoiceInput =
    isVoiceControlEnabled && isSupported && !showStop && !isTranscribing;

  const shouldShowVoiceInput = canUseVoiceInput && isEmptyComposer;

  // Send whenever we are not in the mic-replacement slot (and not Stop).
  // Empty + voice off → disabled send stays visible.
  const shouldShowSendButton =
    !showStop && !isTranscribing && !shouldShowVoiceInput;

  return {
    actionFeedback,
    canSendMessage,
    contentLibraryItems,
    editor,
    handlePasteImages,
    handleRemoveAttachment,
    handleRemoveReference,
    handleInsertReference,
    handleSelectAction,
    handleSelectContentReference,
    handleSend,
    handleShellPointerDown,
    hasAttachments,
    isContentLibraryLoading,
    isContentPickerOpen,
    isDragActive,
    isListening,
    isTranscribing,
    references: displayedReferences,
    selectedContentIds,
    setIsContentPickerOpen,
    shouldShowSendButton,
    shouldShowVoiceInput,
    startListening,
    stopListening,
  };
}
