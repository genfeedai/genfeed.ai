import type { ExtractedMention } from '@genfeedai/agent/components/AgentChatInput';
import type { AgentChatReferenceItem } from '@genfeedai/agent/components/AgentChatInputAttachmentTray';
import { createSuggestionPopupRenderer } from '@genfeedai/agent/utils/suggestion-popup.util';
import type { JSONContent } from '@tiptap/core';
import { SendOnEnter } from '@ui/prompt-editor/send-on-enter.extension';
import type { ComponentType } from 'react';

export { SendOnEnter };

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
  // Content library picks are no longer TipTap tokens — only brand/team/
  // credential mentions still live in the document.
  const references: AgentChatReferenceItem[] = [];
  for (const mention of mentions) {
    if (mention.type === 'brand') {
      references.push({
        id: mention.id,
        label: `#${mention.brandName}`,
        type: 'brand',
      });
      continue;
    }
    if (mention.type === 'team') {
      references.push({
        id: mention.id,
        label: `@${mention.displayName}`,
        type: 'team',
      });
      continue;
    }
    if (mention.type === 'credential') {
      references.push({
        id: mention.id,
        label: `!${mention.handle}`,
        type: 'credential',
      });
    }
  }
  return references;
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

export function buildMentionSuggestion<T>({
  component,
  getItems,
}: {
  component: ComponentType<{ items: T[]; command: (item: T) => void }>;
  getItems: (query: string) => T[];
}) {
  return {
    items: ({ query }: { query: string }) => getItems(query),
    render: () => createSuggestionPopupRenderer(component),
  };
}
