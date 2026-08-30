import type { AgentChatReferenceItem } from '@genfeedai/agent/components/AgentChatInputAttachmentTray';
import {
  areAgentChatMentionReferencesEqual,
  buildMentionSuggestion,
  extractMentions,
  mapMentionsToReferences,
  SendOnEnter,
} from '@genfeedai/agent/components/agent-chat-input.mentions';
import { useConversationComposerShell } from '@genfeedai/agent/components/ConversationComposerShellContext';
import { CredentialMentionList } from '@genfeedai/agent/components/CredentialMentionList';
import { TeamMentionList } from '@genfeedai/agent/components/TeamMentionList';
import { parseConversationComposerCommand } from '@genfeedai/agent/constants/conversation-composer-actions.constant';
import { CharacterMention } from '@genfeedai/agent/extensions/character-mention.extension';
import { CredentialMention } from '@genfeedai/agent/extensions/credential-mention.extension';
import { SlashCommands } from '@genfeedai/agent/extensions/slash-commands.extension';
import { TeamMention } from '@genfeedai/agent/extensions/team-mention.extension';
import { useCharacterMentions } from '@genfeedai/agent/hooks/use-character-mentions';
import { useContentMentions } from '@genfeedai/agent/hooks/use-content-mentions';
import { useCredentialMentions } from '@genfeedai/agent/hooks/use-credential-mentions';
import { useMicrophoneInput } from '@genfeedai/agent/hooks/use-microphone-input';
import { useTeamMentions } from '@genfeedai/agent/hooks/use-team-mentions';
import type {
  ConversationComposerActionName,
  ConversationComposerArtifactReference,
  ConversationComposerGenerationMode,
  ConversationComposerGenerationSettings,
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
} from '@genfeedai/agent/stores/conversation-composer-draft.store';
import type { ContentMentionItem } from '@genfeedai/agent/types/mention.types';
import { applyComposerDocument } from '@genfeedai/agent/utils/apply-composer-document.util';
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
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { applyPromptEditorPasteText } from '@ui/prompt-editor/apply-prompt-editor-paste';
import { normalizePromptEditorPasteText } from '@ui/prompt-editor/normalize-prompt-editor-paste';
import { useTranslations } from 'next-intl';
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

/** Strip inline context already owned by shell scope or the attachment tray. */
function stripRedundantContextMentionNodes(document: JSONContent): JSONContent {
  function walk(node: JSONContent): JSONContent | null {
    if (node.type === 'brandMention' || node.type === 'contentMention') {
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
  generationMode?: ConversationComposerGenerationMode;
  generationSettings?: ConversationComposerGenerationSettings;
  onSend: (
    content: string,
    mentions?: ExtractedMention[],
    attachments?: ChatAttachment[],
    options?: ConversationComposerSendOptions,
  ) => boolean | undefined | Promise<boolean | undefined>;
  onPromoteQueuedFollowUp?: () => void;
  hasQueuedFollowUps?: boolean;
  onStop?: () => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  apiService?: AgentApiService;
  showStop?: boolean;
  attachments?: AttachmentItem[];
  isUploading?: boolean;
  dragState?: DragState;
  dragHandlers?: DragHandlers;
  addFiles?: (files: File[]) => void;
  removeAttachment?: (id: string) => void;
  getCompletedAttachments?: () => ChatAttachment[];
  clearAllAttachments?: () => void;
}

export function useAgentChatInput({
  generationMode = 'auto',
  generationSettings,
  onSend,
  onPromoteQueuedFollowUp,
  hasQueuedFollowUps = false,
  disabled,
  placeholder: placeholderOverride,
  apiService,
  showStop = false,
  attachments = [],
  isUploading = false,
  dragState,
  addFiles,
  removeAttachment,
  getCompletedAttachments,
  clearAllAttachments,
}: UseAgentChatInputParams) {
  const composerShell = useConversationComposerShell();
  const translate = useTranslations('common.agent.composer');
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
  const isDragActive = dragState?.isActive ?? false;
  const placeholder = isDragActive
    ? translate('dropPlaceholder')
    : (placeholderOverride ??
      'Ask for help with content, review, or planning…');
  const placeholderRef = useRef(placeholder);
  const clearComposerSeed = useAgentChatStore((s) => s.clearComposerSeed);

  const { mentions: credentialMentions } = useCredentialMentions(
    apiService ?? null,
  );
  const { mentions: teamMentions } = useTeamMentions(apiService ?? null);
  const { mentions: characterMentions } = useCharacterMentions(
    apiService ?? null,
  );
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
  // Live prompt text for the generation-setup recommendation debounce — the
  // toolbar has no other way to see what the operator is typing.
  const [promptText, setPromptText] = useState(restoredDraft.plainText);
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
    return stripRedundantContextMentionNodes(restoredDraft.document);
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

        const normalized = normalizePromptEditorPasteText(plain);
        event.preventDefault();
        if (!normalized) {
          return true;
        }

        const { state, dispatch } = view;
        dispatch(applyPromptEditorPasteText(state, normalized));
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
      CharacterMention.configure({
        HTMLAttributes: { class: 'mention mention-character' },
        renderText({ node }) {
          return node.attrs.label ?? node.attrs.handle;
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
            getItems: (query) => {
              const needle = query.toLowerCase();
              const characters = characterMentions.filter(
                (item) =>
                  item.handle.toLowerCase().includes(needle) ||
                  item.label.toLowerCase().includes(needle),
              );
              const team = teamMentions.filter((item) =>
                item.displayName.toLowerCase().includes(needle),
              );
              return [
                ...characters.map((item) => ({
                  avatar: undefined,
                  displayName: `${item.label} (@${item.handle})`,
                  handle: item.handle,
                  id: item.id,
                  isAgent: false,
                  label: item.label,
                  role: 'Character',
                })),
                ...team,
              ];
            },
          }),
          command: ({ editor, props, range }) => {
            const mention = props as {
              displayName?: string;
              handle?: string;
              id: string;
              isAgent?: boolean;
              label?: string;
              role?: string;
            };
            if (mention.role === 'Character') {
              editor
                .chain()
                .focus()
                .insertContentAt(range, {
                  attrs: {
                    handle: mention.handle,
                    id: mention.id,
                    label: mention.label,
                  },
                  type: 'characterMention',
                })
                .run();
              return;
            }
            editor
              .chain()
              .focus()
              .insertContentAt(range, {
                attrs: {
                  displayName: mention.displayName,
                  isAgent: mention.isAgent,
                  role: mention.role,
                  userId: mention.id,
                },
                type: 'teamMention',
              })
              .run();
          },
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
      setPromptText(editor.getText());
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
    editor.on('update', updateHandler);
    return () => {
      editor.off('update', updateHandler);
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
      ? stripRedundantContextMentionNodes(draft.document)
      : '';
    applyComposerDocument(editor, cleanedDocument);
    setIsEmpty(editor.isEmpty);
    setPromptText(editor.getText());
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

    // Autofocus on every mount and scope change (new conversation, thread
    // switch) — typing should never require clicking the composer first.
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

  // Refresh the empty-state placeholder after editor or copy changes.
  useLayoutEffect(() => {
    placeholderRef.current = placeholder;
    if (!editor?.isEmpty) {
      return;
    }
    editor.view.dispatch(editor.state.tr);
  }, [editor, placeholder]);

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
      if (hasQueuedFollowUps) {
        onPromoteQueuedFollowUp?.();
      }
      return;
    }
    const hasInFlightAttachment =
      isUploading ||
      attachments.some(
        (attachment) =>
          attachment.status === 'pending' || attachment.status === 'uploading',
      );
    if (hasInFlightAttachment) {
      setActionFeedback(translate('uploadInProgress'));
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
    const accepted = await onSend(
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
        generationMode,
        ...(generationMode !== 'auto' && generationSettings
          ? { generationSettings }
          : {}),
        planModeEnabled: false,
      },
    );
    if (accepted === false) {
      setActionFeedback(translate('queueFull'));
      return;
    }
    editor.commands.clearContent();
    setContentReferences([]);
    clearAllAttachments?.();
    clearConversationComposerDraft(draftScopeKey);
  }, [
    attachments,
    composerShell,
    contentReferences,
    draftScopeKey,
    editor,
    disabled,
    hasQueuedFollowUps,
    isListening,
    isTranscribing,
    isUploading,
    onPromoteQueuedFollowUp,
    onSend,
    hasCompletedAttachments,
    getCompletedAttachments,
    generationMode,
    generationSettings,
    clearAllAttachments,
    surfaceArtifactReferences,
    translate,
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

  const canSendMessage = !isEmpty || hasCompletedAttachments;

  // Empty composer = no text and no ready attachments.
  const isEmptyComposer = isEmpty && !hasCompletedAttachments;

  // Org Voice Control + browser MediaRecorder. When both are true and the
  // field is empty, mic *replaces* the send button on the trailing edge.
  const canUseVoiceInput =
    isVoiceControlEnabled && isSupported && !isTranscribing;

  // Stop occupies the mic slot while a run is in flight. Send still appears
  // beside Stop when the field has text so Enter can queue a follow-up.
  const shouldShowVoiceInput = canUseVoiceInput && isEmptyComposer && !showStop;
  const shouldShowSendButton =
    !isTranscribing && !shouldShowVoiceInput && (!showStop || canSendMessage);

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
    promptText,
    references: displayedReferences,
    selectedContentIds,
    setIsContentPickerOpen,
    shouldShowSendButton,
    shouldShowVoiceInput,
    startListening,
    stopListening,
  };
}
