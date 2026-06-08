'use client';

import type { AiActionType } from '@genfeedai/enums';
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
import { useCallback, useEffect, useState } from 'react';
import '@ui/editors/rich-editor.css';
import RichTextEditorToolbar from './RichTextEditorToolbar';

export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Start writing…',
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
        <RichTextEditorToolbar
          editor={editor}
          shouldShowHeadings={shouldShowHeadings}
          shouldShowAdvancedFormatting={shouldShowAdvancedFormatting}
          shouldShowLists={shouldShowLists}
          shouldShowBlockquote={shouldShowBlockquote}
          shouldShowCodeBlock={shouldShowCodeBlock}
          headingValue={headingValue}
          activeAiAction={activeAiAction}
          handleAiAction={handleAiAction}
          aiConfig={aiConfig}
          value={value}
        />
      )}

      {/* Editor Content */}
      <EditorContent editor={editor} />
    </div>
  );
}
