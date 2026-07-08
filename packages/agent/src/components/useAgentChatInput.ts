import { BrandMentionList } from '@genfeedai/agent/components/BrandMentionList';
import { ContentMentionList } from '@genfeedai/agent/components/ContentMentionList';
import { CredentialMentionList } from '@genfeedai/agent/components/CredentialMentionList';
import { TeamMentionList } from '@genfeedai/agent/components/TeamMentionList';
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
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
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
  useRef,
  useState,
} from 'react';
import tippy, { type Instance } from 'tippy.js';
import type { ExtractedMention } from './AgentChatInput';

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
    options?: { planModeEnabled?: boolean },
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
  const activeThreadId = useAgentChatStore((s) => s.activeThreadId);
  const composerSeed = useAgentChatStore((s) => s.composerSeed);
  const clearComposerSeed = useAgentChatStore((s) => s.clearComposerSeed);

  const { mentions: credentialMentions } = useCredentialMentions(
    apiService ?? null,
  );
  const { mentions: brandMentions } = useBrandMentions();
  const { mentions: teamMentions } = useTeamMentions(apiService ?? null);
  const { mentions: contentMentions } = useContentMentions(apiService ?? null);

  const [isEmpty, setIsEmpty] = useState(true);
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
    editorProps: {
      attributes: {
        class:
          'prose prose-sm prose-invert max-w-none flex-1 bg-transparent py-1.5 text-sm text-foreground focus:outline-none',
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

  // Track editor empty state
  useEffect(() => {
    if (!editor) {
      return;
    }
    const updateHandler = () => {
      setIsEmpty(editor.isEmpty);
    };
    editor.on('update', updateHandler);
    return () => {
      editor.off('update', updateHandler);
    };
  }, [editor]);

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

  // Handle Enter key to send message
  useEffect(() => {
    function handleSendEvent() {
      if (!editor || disabled) {
        return;
      }
      const text = editor.getText().trim();
      const canSend = Boolean(text) || hasCompletedAttachments;
      if (!canSend) {
        return;
      }
      const json = editor.getJSON();
      const mentionData = extractMentions(json);
      const completed = getCompletedAttachments?.();
      onSend(
        text,
        mentionData.length > 0 ? mentionData : undefined,
        completed && completed.length > 0 ? completed : undefined,
        { planModeEnabled: false },
      );
      editor.commands.clearContent();
      clearAllAttachments?.();
    }

    document.addEventListener('agent-chat-send', handleSendEvent);
    return () =>
      document.removeEventListener('agent-chat-send', handleSendEvent);
  }, [
    editor,
    disabled,
    onSend,
    hasCompletedAttachments,
    getCompletedAttachments,
    clearAllAttachments,
  ]);

  // Sync disabled state
  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [editor, disabled]);

  const handleSend = useCallback(() => {
    if (!editor || disabled) {
      return;
    }
    const text = editor.getText().trim();
    const canSend = Boolean(text) || hasCompletedAttachments;
    if (!canSend) {
      return;
    }
    const json = editor.getJSON();
    const mentionData = extractMentions(json);
    const completed = getCompletedAttachments?.();
    onSend(
      text,
      mentionData.length > 0 ? mentionData : undefined,
      completed && completed.length > 0 ? completed : undefined,
      { planModeEnabled: false },
    );
    editor.commands.clearContent();
    clearAllAttachments?.();
  }, [
    editor,
    disabled,
    onSend,
    hasCompletedAttachments,
    getCompletedAttachments,
    clearAllAttachments,
  ]);

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

      const files = Array.from(event.clipboardData.files ?? []).filter((file) =>
        file.type.startsWith('image/'),
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
    canSendMessage,
    editor,
    handlePasteImages,
    handleRemoveAttachment,
    handleSend,
    handleShellPointerDown,
    hasAttachments,
    isDragActive,
    isListening,
    isTranscribing,
    shouldShowSendButton,
    shouldShowVoiceInput,
    startListening,
    stopListening,
  };
}
