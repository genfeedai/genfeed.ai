import { AgentCommandList } from '@cloud/agent/components/AgentCommandList';
import {
  AGENT_SLASH_COMMANDS,
  type AgentSlashCommand,
} from '@cloud/agent/constants/agent-slash-commands.constant';
import { Extension, ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import tippy, { type Instance } from 'tippy.js';

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
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent(props.promptPrefix)
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
        render: () => {
          let component: ReactRenderer;
          let popup: Instance[];

          return {
            onExit: () => {
              popup[0].destroy();
              component.destroy();
            },
            onKeyDown: (props) => {
              if (props.event.key === 'Escape') {
                popup[0].hide();
                return true;
              }
              return (
                (
                  component.ref as {
                    onKeyDown?: (props: { event: KeyboardEvent }) => boolean;
                  }
                )?.onKeyDown?.(props) ?? false
              );
            },
            onStart: (props) => {
              component = new ReactRenderer(AgentCommandList, {
                editor: props.editor,
                props,
              });
              popup = tippy('body', {
                appendTo: () => document.body,
                content: component.element,
                getReferenceClientRect: props.clientRect as () => DOMRect,
                interactive: true,
                placement: 'bottom-start',
                showOnCreate: true,
                trigger: 'manual',
              });
            },
            onUpdate: (props) => {
              component.updateProps(props);
              popup[0].setProps({
                getReferenceClientRect: props.clientRect as () => DOMRect,
              });
            },
          };
        },
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
