'use client';

import type { SuggestedAction } from '@genfeedai/agent/models/agent-suggested-action.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  HiOutlineClipboardDocumentCheck,
  HiOutlinePencilSquare,
  HiOutlineSparkles,
} from 'react-icons/hi2';

interface AgentDraftContextInput {
  body?: string;
  contentFormat?: string;
  draftType: 'article' | 'newsletter' | 'post' | 'thread';
  instructions?: string;
  onApplySuggestion?: (payload: AgentDraftSuggestionPayload) => void;
  selectionRootId?: string;
  summary?: string;
  title?: string;
}

const MAX_CONTEXT_TEXT_LENGTH = 4_000;
export const AGENT_DRAFT_SUGGESTION_EVENT = 'genfeed:agent-draft-suggestion';

export interface AgentDraftSuggestionPayload {
  mode?: 'append' | 'replace' | 'replace-selection';
  selectedText?: string;
  sourceAction?: string;
  text: string;
}

function clampContextText(value?: string): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return undefined;
  }

  if (normalized.length <= MAX_CONTEXT_TEXT_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_CONTEXT_TEXT_LENGTH)}...`;
}

function createDraftActions(draftType: string): SuggestedAction[] {
  return [
    {
      icon: HiOutlinePencilSquare({ className: 'size-5 text-foreground/50' }),
      label: 'Improve',
      prompt: `Review the current ${draftType} draft and suggest concrete improvements.`,
    },
    {
      icon: HiOutlineSparkles({ className: 'size-5 text-foreground/50' }),
      label: 'Rewrite',
      prompt: `Rewrite the current ${draftType} draft in a sharper brand voice.`,
    },
    {
      icon: HiOutlineClipboardDocumentCheck({
        className: 'size-5 text-foreground/50',
      }),
      label: 'Checklist',
      prompt: `Check the current ${draftType} draft for clarity, structure, and publish readiness.`,
    },
  ];
}

export function useAgentDraftContext({
  body,
  contentFormat,
  draftType,
  instructions,
  onApplySuggestion,
  selectionRootId,
  summary,
  title,
}: AgentDraftContextInput): void {
  const pathname = usePathname();
  const setPageContext = useAgentChatStore((s) => s.setPageContext);
  const [selectedText, setSelectedText] = useState<string | undefined>();

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    function handleSelectionChange() {
      const selection = window.getSelection();
      const text = clampContextText(selection?.toString());

      if (!text) {
        setSelectedText(undefined);
        return;
      }

      if (selectionRootId) {
        const root = document.getElementById(selectionRootId);
        const anchorNode = selection?.anchorNode;
        const focusNode = selection?.focusNode;

        if (
          !root ||
          !anchorNode ||
          !focusNode ||
          !root.contains(anchorNode) ||
          !root.contains(focusNode)
        ) {
          return;
        }
      }

      setSelectedText(text);
    }

    document.addEventListener('selectionchange', handleSelectionChange);
    return () =>
      document.removeEventListener('selectionchange', handleSelectionChange);
  }, [selectionRootId]);

  const context = useMemo(
    () => ({
      contentFormat,
      draftBody: clampContextText(body),
      draftInstructions: clampContextText(instructions),
      draftSummary: clampContextText(summary),
      draftTitle: clampContextText(title),
      draftType,
      placeholder: `Ask the co-pilot to improve this ${draftType}...`,
      route: pathname,
      selectedText,
      suggestedActions: createDraftActions(draftType),
    }),
    [
      body,
      contentFormat,
      draftType,
      instructions,
      pathname,
      selectedText,
      summary,
      title,
    ],
  );

  useEffect(() => {
    setPageContext(context);
  }, [context, setPageContext]);

  useEffect(() => {
    if (typeof window === 'undefined' || !onApplySuggestion) {
      return;
    }

    function handleDraftSuggestion(event: Event) {
      if (!onApplySuggestion) {
        return;
      }

      const customEvent = event as CustomEvent<AgentDraftSuggestionPayload>;
      const text = customEvent.detail?.text?.trim();

      if (!text) {
        return;
      }

      customEvent.preventDefault();
      onApplySuggestion({
        mode: customEvent.detail.mode,
        selectedText: customEvent.detail.selectedText,
        sourceAction: customEvent.detail.sourceAction,
        text,
      });
    }

    window.addEventListener(
      AGENT_DRAFT_SUGGESTION_EVENT,
      handleDraftSuggestion,
    );
    return () =>
      window.removeEventListener(
        AGENT_DRAFT_SUGGESTION_EVENT,
        handleDraftSuggestion,
      );
  }, [onApplySuggestion]);
}
