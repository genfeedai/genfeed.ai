import type { PromptCommand } from '@genfeedai/props/prompt-bars/prompt-command.props';
import type { Editor, Range } from '@tiptap/core';
import { Extension } from '@tiptap/react';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import { PromptCommandList } from '@ui/prompt-editor/PromptCommandList';
import { createSuggestionPopupRenderer } from '@ui/prompt-editor/suggestion-popup.util';

export interface PromptCommandSelection {
  editor: Editor;
  item: PromptCommand;
  /** Editor range covering the typed `/query`, already matched by TipTap. */
  range: Range;
}

export interface PromptCommandsOptions {
  /**
   * Resolves the palette for the current query. Read through a ref by the
   * caller so an async catalog can land without rebuilding the editor.
   */
  getItems: (query: string) => PromptCommand[];
  /** Applies the selection. Callers own insertion so surfaces can differ. */
  onSelect: (selection: PromptCommandSelection) => void;
}

export function promptCommandText(item: PromptCommand): string {
  if (item.kind === 'action') {
    return `/${item.actionName ?? item.name} `;
  }

  // A skill may also seed a prompt, so a one-keystroke command like
  // `/interview` lands ready to send instead of ready to type.
  if (item.kind === 'skill') {
    return `/${item.skillSlug ?? item.name} ${item.promptPrefix ?? ''}`;
  }

  return item.promptPrefix ?? '';
}

/**
 * Inserts the palette's text for a command and leaves the caret after it.
 *
 * A picked skill stays in the prompt as a literal `/slug` token rather than
 * hidden state: what the operator sees is what the turn sends, and deleting
 * the token un-picks the skill. `extractRequestedSkillSlugs` strips it back
 * off at submit time so the model never reads it.
 */
export function insertPromptCommandText({
  editor,
  item,
  range,
}: PromptCommandSelection): void {
  const insertedContent = promptCommandText(item);

  editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContent(insertedContent)
    .run();
}

/**
 * Shared `/` palette for every TipTap composer. The item source is injected,
 * so Agent and Studio show the same control over different catalogs.
 */
export const PromptCommands = Extension.create<PromptCommandsOptions>({
  addOptions() {
    return {
      getItems: () => [],
      onSelect: insertPromptCommandText,
    };
  },

  addProseMirrorPlugins() {
    const { getItems, onSelect } = this.options;

    return [
      Suggestion({
        char: '/',
        command: ({ editor, props, range }) => {
          onSelect({ editor, item: props, range });
        },
        editor: this.editor,
        items: ({ query }: { query: string }) => getItems(query),
        render: () => createSuggestionPopupRenderer(PromptCommandList),
        startOfLine: true,
      } as SuggestionOptions<PromptCommand>),
    ];
  },

  name: 'promptCommands',
});

/**
 * Case-insensitive match over the parts a user actually types: the slash name,
 * the human label, and the description.
 */
export function filterPromptCommands(
  commands: readonly PromptCommand[],
  query: string,
): PromptCommand[] {
  const needle = query.trim().toLowerCase();

  if (!needle) {
    return [...commands];
  }

  return commands.filter(
    (command) =>
      command.name.toLowerCase().includes(needle) ||
      command.label.toLowerCase().includes(needle) ||
      command.description.toLowerCase().includes(needle),
  );
}
