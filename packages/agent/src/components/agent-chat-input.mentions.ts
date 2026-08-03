import type { ExtractedMention } from '@genfeedai/agent/components/AgentChatInput';
import type { AgentChatReferenceItem } from '@genfeedai/agent/components/AgentChatInputAttachmentTray';
import type { JSONContent } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import type { MentionNodeAttrs } from '@tiptap/extension-mention';
import { ReactRenderer } from '@tiptap/react';
import type { SuggestionProps } from '@tiptap/suggestion';
import type { ComponentType } from 'react';
import tippy, { type Instance } from 'tippy.js';

export function extractMentions(json: JSONContent): ExtractedMention[] {
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

export function mapMentionsToReferences(
  mentions: readonly ExtractedMention[],
): AgentChatReferenceItem[] {
  return mentions.map((mention) => ({
    id: mention.id,
    label:
      mention.type === 'brand'
        ? `#${mention.brandName}`
        : mention.type === 'team'
          ? `@${mention.displayName}`
          : mention.type === 'credential'
            ? `!${mention.handle}`
            : `^${mention.contentTitle}`,
    type: mention.type,
  }));
}

/** True when mention chip lists are equivalent (order-sensitive). */
export function areAgentChatMentionReferencesEqual(
  previous: readonly AgentChatReferenceItem[],
  next: readonly AgentChatReferenceItem[],
): boolean {
  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    const left = previous[index];
    const right = next[index];
    if (
      !left ||
      !right ||
      left.id !== right.id ||
      left.label !== right.label ||
      left.type !== right.type
    ) {
      return false;
    }
  }

  return true;
}

interface SendOnEnterOptions {
  onEnter: () => boolean;
}

// Enter submits the message (mirroring the Send button); Shift+Enter falls
// through to the HardBreak newline. Declared before the mention/slash
// extensions so their Suggestion plugins keep Enter-to-select while a popup is
// open, but ahead of the core newline keymap when no popup is active. The IME
// guard prevents committing an in-progress composition (critical for CJK).
export const SendOnEnter = Extension.create<SendOnEnterOptions>({
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        if (editor.view.composing) {
          return false;
        }
        return this.options.onEnter();
      },
    };
  },
  addOptions() {
    return {
      onEnter: () => false,
    };
  },
  name: 'sendOnEnter',
});

type MentionSuggestionRenderProps = SuggestionProps<unknown, MentionNodeAttrs>;

export function getMentionClientRect(
  props: MentionSuggestionRenderProps,
): () => DOMRect {
  return () => props.clientRect?.() ?? new DOMRect();
}

export function buildMentionSuggestion<T>({
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
