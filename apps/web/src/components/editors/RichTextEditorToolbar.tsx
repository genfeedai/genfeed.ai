'use client';

import {
  AI_ACTION_LABELS,
  AiActionType,
  ButtonSize,
  ButtonVariant,
  ComponentSize,
} from '@genfeedai/contracts';
import type { Editor } from '@tiptap/react';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import Spinner from '@ui/primitives/spinner';
import { Toggle } from '@ui/primitives/toggle';
import {
  Bold,
  Code,
  Italic,
  List,
  Sparkles,
  Strikethrough,
} from 'lucide-react';
import type {
  RichTextEditorAiConfig,
  RichTextEditorFormatToggleProps,
} from '@/props/components/rich-text-editor.props';
import GenerationInsertButton from './GenerationInsertButton';

function FormatToggle({
  children,
  editor,
  label,
  mark,
  onToggle,
}: RichTextEditorFormatToggleProps) {
  return (
    <Toggle
      aria-label={label}
      onPressedChange={onToggle}
      pressed={editor.isActive(mark)}
      size="sm"
      title={label}
    >
      {children}
    </Toggle>
  );
}

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
  isGenerationInsertEnabled?: boolean;
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
  isGenerationInsertEnabled = false,
  value,
}: RichTextEditorToolbarProps) {
  return (
    <div
      className="toolbar flex flex-wrap gap-2 p-2 border-b border-border bg-background/50"
      role="toolbar"
      aria-label="Formatting options"
    >
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

      <FormatToggle
        editor={editor}
        label="Bold"
        mark="bold"
        onToggle={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-4" />
      </FormatToggle>

      <FormatToggle
        editor={editor}
        label="Italic"
        mark="italic"
        onToggle={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-4" />
      </FormatToggle>

      {shouldShowAdvancedFormatting && (
        <>
          <FormatToggle
            editor={editor}
            label="Strikethrough"
            mark="strike"
            onToggle={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough className="size-4" />
          </FormatToggle>

          <FormatToggle
            editor={editor}
            label="Code"
            mark="code"
            onToggle={() => editor.chain().focus().toggleCode().run()}
          >
            <Code className="size-4" />
          </FormatToggle>
        </>
      )}

      <div className="w-px h-6 bg-border mx-1" />

      {/* Lists */}
      {shouldShowLists && (
        <>
          <FormatToggle
            editor={editor}
            label="Bullet List"
            mark="bulletList"
            onToggle={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List className="size-4" />
          </FormatToggle>

          <FormatToggle
            editor={editor}
            label="Numbered List"
            mark="orderedList"
            onToggle={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <List className="size-4" />
          </FormatToggle>
        </>
      )}

      {(shouldShowLists || shouldShowBlockquote || shouldShowCodeBlock) && (
        <div className="w-px h-6 bg-border mx-1" />
      )}

      {/* Blockquote & Code Block */}
      {shouldShowBlockquote && (
        <FormatToggle
          editor={editor}
          label="Blockquote"
          mark="blockquote"
          onToggle={() => editor.chain().focus().toggleBlockquote().run()}
        >
          &quot;
        </FormatToggle>
      )}

      {shouldShowCodeBlock && (
        <FormatToggle
          editor={editor}
          label="Code Block"
          mark="codeBlock"
          onToggle={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          {'</>'}
        </FormatToggle>
      )}

      {isGenerationInsertEnabled && (
        <>
          <div className="w-px h-6 bg-border mx-1" />
          <GenerationInsertButton editor={editor} />
        </>
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
                variant={ButtonVariant.GHOST}
                size={ButtonSize.XS}
                onClick={() => handleAiAction(action)}
                title={AI_ACTION_LABELS[action]}
                ariaLabel={AI_ACTION_LABELS[action]}
                isDisabled={activeAiAction !== null || !value}
              >
                {isActive ? (
                  <Spinner size={ComponentSize.XS} />
                ) : (
                  <span className="flex items-center gap-1 text-xs">
                    <Sparkles className="size-3.5" />
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
