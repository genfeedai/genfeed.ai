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
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { PromptBarAttachedAsset } from '@props/studio/prompt-bar.props';
import type {
  AttachmentItem,
  ChatAttachment,
  DragHandlers,
  DragState,
} from '@props/ui/attachments.props';
import { type Editor, Extension, type JSONContent } from '@tiptap/core';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, ReactRenderer, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Button from '@ui/buttons/base/Button';
import PromptBarAttachedAssetsTray from '@ui/prompt-bars/components/attached-assets-tray/PromptBarAttachedAssetsTray';
import PromptBarShell from '@ui/prompt-bars/components/shell/PromptBarShell';
import {
  type ChangeEvent,
  type ComponentType,
  type ReactElement,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  HiArrowUp,
  HiOutlineArrowPath,
  HiOutlineMicrophone,
  HiOutlinePaperClip,
} from 'react-icons/hi2';
import tippy, { type Instance } from 'tippy.js';

export type ExtractedMention =
  | { type: 'brand'; id: string; brandName: string; brandSlug: string }
  | {
      type: 'team';
      id: string;
      displayName: string;
      role: string;
      isAgent: boolean;
    }
  | { type: 'credential'; id: string; handle: string; platform: string }
  | { type: 'content'; id: string; contentTitle: string; contentType: string };

interface AgentChatInputProps {
  onSend: (
    content: string,
    mentions?: ExtractedMention[],
    attachments?: ChatAttachment[],
    options?: {
      planModeEnabled?: boolean;
    },
  ) => void;
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

function mapAttachmentToTrayAsset(
  item: AttachmentItem,
): PromptBarAttachedAsset {
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    previewUrl: item.previewUrl,
    role: 'input',
    source: 'upload',
  };
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
        // biome-ignore lint/suspicious/noExplicitAny: tiptap SuggestionProps type is complex
        onStart: (props: any) => {
          reactRenderer = new ReactRenderer(
            component as ComponentType<Record<string, unknown>>,
            {
              editor: props.editor as Editor,
              props,
            },
          );
          popup = tippy('body', {
            appendTo: () => document.body,
            content: reactRenderer.element,
            getReferenceClientRect: props.clientRect as () => DOMRect,
            interactive: true,
            placement: 'bottom-start',
            showOnCreate: true,
            trigger: 'manual',
          });
        },
        // biome-ignore lint/suspicious/noExplicitAny: tiptap SuggestionProps type is complex
        onUpdate: (props: any) => {
          reactRenderer.updateProps(props);
          if (popup[0]) {
            popup[0].setProps({
              getReferenceClientRect: props.clientRect as () => DOMRect,
            });
          }
        },
      };
    },
  };
}

function shouldIgnorePlanModeShortcut(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  return Boolean(
    document.querySelector(
      [
        '[role="dialog"][data-state="open"]',
        '[role="menu"][data-state="open"]',
        '[role="listbox"][data-state="open"]',
        '[data-radix-popper-content-wrapper] [role="menu"]',
        '[data-radix-popper-content-wrapper] [role="listbox"]',
      ].join(', '),
    ),
  );
}

export function AgentChatInput({
  onSend,
  onStop,
  disabled,
  placeholder = 'Type # brands, @ team, ! accounts, ^ content, / commands',
  apiService,
  showStop = false,
  attachments = [],
  isUploading = false,
  dragState,
  dragHandlers,
  addFiles,
  removeAttachment,
  getCompletedAttachments,
  clearAllAttachments,
}: AgentChatInputProps): ReactElement {
  const activeThreadId = useAgentChatStore((s) => s.activeThreadId);
  const composerSeed = useAgentChatStore((s) => s.composerSeed);
  const clearComposerSeed = useAgentChatStore((s) => s.clearComposerSeed);
  const draftPlanModeEnabled = useAgentChatStore((s) => s.draftPlanModeEnabled);
  const setDraftPlanModeEnabled = useAgentChatStore(
    (s) => s.setDraftPlanModeEnabled,
  );
  const updateThread = useAgentChatStore((s) => s.updateThread);
  const activeThread = useAgentChatStore((s) =>
    s.threads.find((thread) => thread.id === s.activeThreadId),
  );
  const { mentions: credentialMentions } = useCredentialMentions(
    apiService ?? null,
  );
  const { mentions: brandMentions } = useBrandMentions();
  const { mentions: teamMentions } = useTeamMentions(apiService ?? null);
  const { mentions: contentMentions } = useContentMentions(apiService ?? null);
  const [isEmpty, setIsEmpty] = useState(true);
  const editorRef = useRef<Editor | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  useEffect(() => {
    if (!activeThreadId) {
      return;
    }

    setDraftPlanModeEnabled(activeThread?.planModeEnabled ?? false);
  }, [activeThread?.planModeEnabled, activeThreadId, setDraftPlanModeEnabled]);

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
        { planModeEnabled: draftPlanModeEnabled },
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
      { planModeEnabled: draftPlanModeEnabled },
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
    draftPlanModeEnabled,
  ]);

  const handlePlanModeToggle = useCallback(async () => {
    const nextEnabled = !draftPlanModeEnabled;

    setDraftPlanModeEnabled(nextEnabled);

    if (!activeThreadId || !apiService) {
      return;
    }

    updateThread(activeThreadId, { planModeEnabled: nextEnabled });

    try {
      await runAgentApiEffect(
        apiService.updateThreadEffect(activeThreadId, {
          planModeEnabled: nextEnabled,
        }),
      );
    } catch {
      updateThread(activeThreadId, {
        planModeEnabled: draftPlanModeEnabled,
      });
      setDraftPlanModeEnabled(draftPlanModeEnabled);
    }
  }, [
    activeThreadId,
    apiService,
    draftPlanModeEnabled,
    setDraftPlanModeEnabled,
    updateThread,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.shiftKey || event.key !== 'Tab') {
        return;
      }

      if (shouldIgnorePlanModeShortcut()) {
        return;
      }

      event.preventDefault();
      void handlePlanModeToggle();
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handlePlanModeToggle]);

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

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length > 0 && addFiles) {
        addFiles(files);
      }
      // Reset so the same file can be selected again
      event.target.value = '';
    },
    [addFiles],
  );

  const handleRemoveAttachment = useCallback(
    (assetId: string) => {
      removeAttachment?.(assetId);
    },
    [removeAttachment],
  );

  const trayAssets: PromptBarAttachedAsset[] = useMemo(
    () => attachments.map(mapAttachmentToTrayAsset),
    [attachments],
  );

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

  const isDragActive = dragState?.isActive ?? false;

  return (
    <div className="w-full relative" {...dragHandlers}>
      <style>{`
        .ProseMirror {
          min-height: 36px;
          max-height: 200px;
          overflow-y: auto;
          outline: none;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          pointer-events: none;
          height: 0;
          color: hsl(var(--foreground) / 0.3);
        }
        .mention {
          border-radius: 0.25rem;
          padding: 0.125rem 0.25rem;
          font-weight: 500;
        }
        .mention-brand {
          background-color: hsl(35 90% 55% / 0.15);
          color: hsl(35 90% 55%);
        }
        .mention-team {
          background-color: hsl(210 90% 55% / 0.15);
          color: hsl(210 90% 55%);
        }
        .mention-credential {
          background-color: hsl(var(--primary) / 0.15);
          color: hsl(var(--primary));
        }
        .mention-content {
          background-color: hsl(150 60% 45% / 0.15);
          color: hsl(150 60% 45%);
        }
      `}</style>

      {isDragActive && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary/50 bg-primary/5">
          <p className="text-sm font-medium text-primary/70">
            Drop images here
          </p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />

      <PromptBarShell
        className={cn(
          'p-2 shadow-[0_6px_18px_rgba(0,0,0,0.16)] focus-within:shadow-[0_8px_22px_rgba(0,0,0,0.2)]',
          disabled && 'opacity-50',
          isDragActive && 'ring-1 ring-primary/40',
        )}
        data-testid="agent-chat-input-shell"
        onPointerDown={handleShellPointerDown}
      >
        {hasAttachments && (
          <div className="px-2 pb-1 pt-1">
            <PromptBarAttachedAssetsTray
              assets={trayAssets}
              density="compact"
              isDisabled={disabled}
              onBrowseAssets={() => fileInputRef.current?.click()}
              onRemoveAttachedAsset={handleRemoveAttachment}
            />
          </div>
        )}

        <div className="px-2 py-2">
          <EditorContent editor={editor} className="flex-1" />
        </div>

        <div className="mt-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={() => {
                void handlePlanModeToggle();
              }}
              isDisabled={disabled}
              ariaLabel={
                draftPlanModeEnabled ? 'Disable plan mode' : 'Enable plan mode'
              }
              className={cn(
                'inline-flex h-9 items-center rounded-xl border px-3 text-xs font-medium transition-colors',
                draftPlanModeEnabled
                  ? 'border-primary/40 bg-primary/12 text-primary'
                  : 'border-white/12 bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground',
              )}
            >
              {draftPlanModeEnabled ? 'Plan mode on' : 'Plan mode off'}
            </Button>
            <div className="flex items-center gap-2">
              {addFiles && (
                <Button
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  onClick={() => fileInputRef.current?.click()}
                  isDisabled={disabled || isUploading}
                  className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl border border-white/12 bg-white/[0.04] text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground"
                  ariaLabel="Attach image"
                >
                  <HiOutlinePaperClip className="h-4 w-4" />
                </Button>
              )}

              {showStop && onStop ? (
                <Button
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  onClick={() => {
                    void onStop();
                  }}
                  className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/20"
                  ariaLabel="Stop agent"
                >
                  Stop
                </Button>
              ) : null}

              {isTranscribing ? (
                <Button
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  isDisabled
                  className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20 text-primary"
                  aria-label="Transcribing"
                >
                  <HiOutlineArrowPath className="h-4 w-4 animate-spin" />
                </Button>
              ) : !showStop && isListening ? (
                <Button
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  onClick={stopListening}
                  className="relative shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/20 text-red-400 transition-colors hover:bg-red-500/30"
                  aria-label="Stop listening"
                >
                  <HiOutlineMicrophone className="h-4 w-4" />
                  <span className="absolute right-0 top-0 h-2 w-2 animate-pulse rounded-full bg-red-500" />
                </Button>
              ) : shouldShowVoiceInput ? (
                <Button
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  onClick={startListening}
                  isDisabled={disabled}
                  className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl border border-white/12 bg-white/[0.04] text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground"
                  ariaLabel="Start voice input"
                >
                  <HiOutlineMicrophone className="h-4 w-4" />
                </Button>
              ) : shouldShowSendButton ? (
                <Button
                  variant={ButtonVariant.GENERATE}
                  size={ButtonSize.ICON}
                  icon={<HiArrowUp />}
                  onClick={handleSend}
                  isDisabled={
                    disabled || !editor || !canSendMessage || isUploading
                  }
                  className="shrink-0"
                />
              ) : null}
            </div>
          </div>
        </div>
      </PromptBarShell>
    </div>
  );
}
