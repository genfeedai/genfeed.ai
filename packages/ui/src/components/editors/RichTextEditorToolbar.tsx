'use client';

import {
  AI_ACTION_LABELS,
  AiActionType,
  ButtonVariant,
  ComponentSize,
} from '@genfeedai/enums';
import type { RichTextEditorAiConfig } from '@genfeedai/props/components/rich-text-editor.props';
import type { Editor } from '@tiptap/react';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import {
  HiBold,
  HiCodeBracket,
  HiItalic,
  HiListBullet,
  HiQueueList,
  HiSparkles,
  HiStrikethrough,
} from 'react-icons/hi2';

const AI_EDITOR_ACTIONS = [
  AiActionType.GRAMMAR_CHECK,
  AiActionType.TONE_ADJUST,
  AiActionType.SEO_OPTIMIZE,
] as const;

type RichTextEditorToolbarProps = {
  editor: Editor;
  shouldShowHeadings: boolean;
  shouldShowAdvancedFormatting: boolean;
  shouldShowLists: boolean;
  shouldShowBlockquote: boolean;
  shouldShowCodeBlock: boolean;
  headingValue: string;
  activeAiAction: string | null;
  handleAiAction: (action: AiActionType) => Promise<void>;
  aiConfig: RichTextEditorAiConfig | undefined;
  value: string;
};

export default function RichTextEditorToolbar({
  editor,
  shouldShowHeadings,
  shouldShowAdvancedFormatting,
  shouldShowLists,
  shouldShowBlockquote,
  shouldShowCodeBlock,
  headingValue,
  activeAiAction,
  handleAiAction,
  aiConfig,
  value,
}: RichTextEditorToolbarProps) {
  return (
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
        <HiBold className="size-4" />
      </Button>

      <Button
        withWrapper={false}
        variant={ButtonVariant.UNSTYLED}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`h-8 px-2 ${editor.isActive('italic') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
        title="Italic"
        ariaLabel="Italic"
      >
        <HiItalic className="size-4" />
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
            <HiStrikethrough className="size-4" />
          </Button>

          <Button
            withWrapper={false}
            variant={ButtonVariant.UNSTYLED}
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={`h-8 px-2 ${editor.isActive('code') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
            title="Code"
            ariaLabel="Code"
          >
            <HiCodeBracket className="size-4" />
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
            <HiListBullet className="size-4" />
          </Button>

          <Button
            withWrapper={false}
            variant={ButtonVariant.UNSTYLED}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`h-8 px-2 ${editor.isActive('orderedList') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
            title="Numbered List"
            ariaLabel="Numbered List"
          >
            <HiQueueList className="size-4" />
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
                    <HiSparkles className="size-3.5" />
                    {AI_ACTION_LABELS[action]}
                  </span>
                )}
              </Button>
            );
          })}
        </>
      )}
    </div>
  );
}
