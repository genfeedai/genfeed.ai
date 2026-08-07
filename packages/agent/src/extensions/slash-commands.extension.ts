import { AgentCommandList } from '@genfeedai/agent/components/AgentCommandList';
import {
  AGENT_SLASH_COMMANDS,
  type AgentSlashCommand,
} from '@genfeedai/agent/constants/agent-slash-commands.constant';
import { createSuggestionPopupRenderer } from '@genfeedai/agent/utils/suggestion-popup.util';
import { Extension } from '@tiptap/react';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';

type SlashCommandSuggestionOptions = Omit<
  SuggestionOptions<AgentSlashCommand>,
  'editor'
>;

export const SlashCommands = Extension.create<{
  suggestion: Partial<SlashCommandSuggestionOptions>;
}>({
  addOptions() {
    return {
      suggestion: {
        char: '/',
        command: ({ editor, range, props }) => {
          const insertedContent =
            props.kind === 'action'
              ? `/${props.actionName ?? props.name} `
              : (props.promptPrefix ?? '');
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent(insertedContent)
            .run();
        },
        items: ({ query }: { query: string }) => {
          const lower = query.toLowerCase();
          return AGENT_SLASH_COMMANDS.filter(
            (cmd) =>
              cmd.name.toLowerCase().includes(lower) ||
              cmd.label.toLowerCase().includes(lower),
          );
        },
        render: () => createSuggestionPopupRenderer(AgentCommandList),
        startOfLine: true,
      } satisfies Partial<SlashCommandSuggestionOptions>,
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      } as SuggestionOptions<AgentSlashCommand>),
    ];
  },
  name: 'slashCommands',
});
