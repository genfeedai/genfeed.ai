'use client';

import {
  AI_ACTION_LABELS,
  AiActionType,
  ButtonVariant,
  ComponentSize,
} from '@genfeedai/enums';
import type { RichTextEditorProps } from '@genfeedai/props/components/rich-text-editor.props';
import { AiActionsService } from '@genfeedai/services/ai/ai-actions.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import type {} from '@tiptap/extension-blockquote';
import type {} from '@tiptap/extension-bold';
import type {} from '@tiptap/extension-code';
import type {} from '@tiptap/extension-code-block';
import type {} from '@tiptap/extension-heading';
import Image from '@tiptap/extension-image';
import type {} from '@tiptap/extension-italic';
import Link from '@tiptap/extension-link';
import type {} from '@tiptap/extension-list';
import type {} from '@tiptap/extension-paragraph';
import Placeholder from '@tiptap/extension-placeholder';
import type {} from '@tiptap/extension-strike';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useCallback, useEffect, useState } from 'react';
import {
  HiBold,
  HiCodeBracket,
  HiItalic,
  HiListBullet,
  HiQueueList,
  HiSparkles,
  HiStrikethrough,
} from 'react-icons/hi2';
import '@ui/editors/rich-editor.scss';

const AI_EDITOR_ACTIONS = [
  AiActionType.GRAMMAR_CHECK,
  AiActionType.TONE_ADJUST,
  AiActionType.SEO_OPTIMIZE,
] as const;

export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Start writing...',
  className = '',
  readOnly = false,
  showToolbar = true,
  toolbarMode = 'full',
  minHeight = { desktop: 400, mobile: 200 },
  aiConfig,
}: RichTextEditorProps) {
  const [activeAiAction, setActiveAiAction] = useState<string | null>(null);

  // Normalize minHeight to object format
  const minHeightConfig =
    typeof minHeight === 'number'
      ? { desktop: minHeight, mobile: minHeight }
      : minHeight;

  const editor = useEditor({
    content: value,
    editable: !readOnly,
    editorProps: {
      attributes: {
        class:
          'prose prose-sm sm:prose lg:prose-lg xl:prose-xl max-w-none focus:outline-none p-4',
        style: `--editor-min-height-mobile: ${minHeightConfig.mobile}px; --editor-min-height-desktop: ${minHeightConfig.desktop}px;`,
      },
      handleDrop: (_view: unknown, event: DragEvent) => {
        const dataTransfer = event.dataTransfer;
        // If this is a post reorder drop, prevent TipTap from handling it
        if (dataTransfer?.types.includes('application/x-post-reorder')) {
          return false; // Prevent default drop behavior
        }
        // Allow normal drop behavior for other content
        return true;
      },
    },
    extensions: [
      StarterKit.configure({
        // Disable Link extension from StarterKit since we're adding it separately
        link: false,
      }),
      Link.configure({
        HTMLAttributes: {
          class: 'text-primary underline',
        },
        openOnClick: false,
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'max-w-full h-auto',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  const handleAiAction = useCallback(
    async (action: AiActionType) => {
      if (!aiConfig || !editor || !value) {
        return;
      }

      setActiveAiAction(action);
      try {
        const service = AiActionsService.getInstance(aiConfig.token);
        const response = await service.execute(aiConfig.orgId, {
          action,
          content: editor.getText(),
        });
        editor.commands.setContent(response.result);
        onChange(editor.getHTML());
      } catch (error) {
        logger.error(`RichTextEditor AI action ${action} failed`, error);
        NotificationsService.getInstance().error('AI action failed');
      } finally {
        setActiveAiAction(null);
      }
    },
    [aiConfig, editor, value, onChange],
  );

  // Sync editor content when value prop changes (but avoid circular updates)
  useEffect(() => {
    if (!editor) {
      return;
    }

    const currentContent = editor.getHTML();
    // Only update if the value is different from current content
    // This prevents infinite loops when onChange updates the value
    if (value !== currentContent) {
      editor.commands.setContent(value || '');
    }
  }, [editor, value]);

  const resolvedToolbarMode =
    showToolbar === false ? 'hidden' : toolbarMode || 'full';
  const shouldShowToolbar = !readOnly && resolvedToolbarMode !== 'hidden';
  const isMinimalToolbar = resolvedToolbarMode === 'minimal';
  const shouldShowHeadings = !isMinimalToolbar;
  const shouldShowAdvancedFormatting = !isMinimalToolbar;
  const shouldShowLists = true;
  const shouldShowBlockquote = true;
  const shouldShowCodeBlock = !isMinimalToolbar;

  // const addLink = useCallback(() => {
  //   if (!editor) return;

  //   const url = window.prompt('Enter URL:');
  //   if (url) {
  //     editor.chain().focus().setLink({ href: url }).run();
  //   }
  // }, [editor]);

  // const addImage = useCallback(() => {
  //   if (!editor) return;

  //   const url = window.prompt('Enter image URL:');
  //   if (url) {
  //     editor.chain().focus().setImage({ src: url }).run();
  //   }
  // }, [editor]);

  if (!editor) {
    return null;
  }

  const activeHeadingLevel = [1, 2, 3, 4, 5, 6].find((level) =>
    editor.isActive('heading', { level }),
  );
  const headingValue = activeHeadingLevel ? String(activeHeadingLevel) : '0';

  return (
    <div className={`rich-text-editor border border-white/[0.08] ${className}`}>
      {/* Toolbar */}
      {shouldShowToolbar && (
        <div
          className="toolbar flex flex-wrap gap-2 p-2 border-b border-white/[0.08] bg-background/50"
          role="toolbar"
          aria-label="Formatting options"
        >
          {/* Headings */}
          {shouldShowHeadings && (
            <Select
              value={headingValue}
              onValueChange={(nextValue) => {
                const level = parseInt(nextValue, 10);
                if (level === 0) {
                  editor.chain().focus().setParagraph().run();
                } else {
                  editor
                    .chain()
                    .focus()
                    .toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 })
                    .run();
                }
              }}
            >
              <SelectTrigger className="h-8 max-w-20 px-2 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">¶</SelectItem>
                <SelectItem value="1">H1</SelectItem>
                <SelectItem value="2">H2</SelectItem>
                <SelectItem value="3">H3</SelectItem>
                <SelectItem value="4">H4</SelectItem>
                <SelectItem value="5">H5</SelectItem>
                <SelectItem value="6">H6</SelectItem>
              </SelectContent>
            </Select>
          )}

          {shouldShowHeadings && <div className="w-px h-6 bg-border mx-1" />}

          {/* Text formatting */}
          <Button
            withWrapper={false}
            variant={ButtonVariant.UNSTYLED}
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`h-8 px-2 ${editor.isActive('bold') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
            title="Bold"
            ariaLabel="Bold"
          >
            <HiBold className="w-4 h-4" />
          </Button>

          <Button
            withWrapper={false}
            variant={ButtonVariant.UNSTYLED}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`h-8 px-2 ${editor.isActive('italic') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
            title="Italic"
            ariaLabel="Italic"
          >
            <HiItalic className="w-4 h-4" />
          </Button>

          {shouldShowAdvancedFormatting && (
            <>
              <Button
                withWrapper={false}
                variant={ButtonVariant.UNSTYLED}
                onClick={() => editor.chain().focus().toggleStrike().run()}
                className={`h-8 px-2 ${editor.isActive('strike') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
                title="Strikethrough"
                ariaLabel="Strikethrough"
              >
                <HiStrikethrough className="w-4 h-4" />
              </Button>

              <Button
                withWrapper={false}
                variant={ButtonVariant.UNSTYLED}
                onClick={() => editor.chain().focus().toggleCode().run()}
                className={`h-8 px-2 ${editor.isActive('code') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
                title="Code"
                ariaLabel="Code"
              >
                <HiCodeBracket className="w-4 h-4" />
              </Button>
            </>
          )}

          <div className="w-px h-6 bg-border mx-1" />

          {/* Lists */}
          {shouldShowLists && (
            <>
              <Button
                withWrapper={false}
                variant={ButtonVariant.UNSTYLED}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                className={`h-8 px-2 ${editor.isActive('bulletList') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
                title="Bullet List"
                ariaLabel="Bullet List"
              >
                <HiListBullet className="w-4 h-4" />
              </Button>

              <Button
                withWrapper={false}
                variant={ButtonVariant.UNSTYLED}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                className={`h-8 px-2 ${editor.isActive('orderedList') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
                title="Numbered List"
                ariaLabel="Numbered List"
              >
                <HiQueueList className="w-4 h-4" />
              </Button>
            </>
          )}

          {(shouldShowLists || shouldShowBlockquote || shouldShowCodeBlock) && (
            <div className="w-px h-6 bg-border mx-1" />
          )}

          {/* Blockquote & Code Block */}
          {shouldShowBlockquote && (
            <Button
              withWrapper={false}
              variant={ButtonVariant.UNSTYLED}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              className={`h-8 px-2 ${editor.isActive('blockquote') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
              title="Blockquote"
              ariaLabel="Blockquote"
            >
              &quot;
            </Button>
          )}

          {shouldShowCodeBlock && (
            <Button
              withWrapper={false}
              variant={ButtonVariant.UNSTYLED}
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              className={`h-8 px-2 ${editor.isActive('codeBlock') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
              title="Code Block"
              ariaLabel="Code Block"
            >
              {'</>'}
            </Button>
          )}

          {/* Link & Image */}
          {/*
          <div className="w-px h-6 bg-border mx-1" />
          <Button
            withWrapper={false}
            variant={editor.isActive('link') ? 'default' : 'ghost'}
            size="sm"
            onClick={addLink}
            title="Add Link"
            ariaLabel="Add Link"
          >
            <HiLink className="w-4 h-4" />
          </Button>

          <Button
            withWrapper={false}
            variant="ghost"
            size="sm"
            onClick={addImage}
            title="Add Image"
            ariaLabel="Add Image"
          >
            <HiPhoto className="w-4 h-4" />
          </Button> */}

          {/* AI Actions */}
          {aiConfig && (
            <>
              <div className="w-px h-6 bg-border mx-1" />
              {AI_EDITOR_ACTIONS.map((action) => {
                const isActive = activeAiAction === action;
                return (
                  <Button
                    key={action}
                    withWrapper={false}
                    variant={ButtonVariant.UNSTYLED}
                    onClick={() => handleAiAction(action)}
                    className="h-8 px-2 hover:bg-accent hover:text-accent-foreground"
                    title={AI_ACTION_LABELS[action]}
                    ariaLabel={AI_ACTION_LABELS[action]}
                    isDisabled={activeAiAction !== null || !value}
                  >
                    {isActive ? (
                      <Spinner size={ComponentSize.XS} />
                    ) : (
                      <span className="flex items-center gap-1 text-xs">
                        <HiSparkles className="w-3.5 h-3.5" />
                        {AI_ACTION_LABELS[action]}
                      </span>
                    )}
                  </Button>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Editor Content */}
      <EditorContent editor={editor} />
    </div>
  );
}
