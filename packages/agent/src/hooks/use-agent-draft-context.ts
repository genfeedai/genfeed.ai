'use client';

import type { SuggestedAction } from '@genfeedai/agent/models/agent-suggested-action.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import type { AgentPageContextState } from '@genfeedai/agent/utils/agent-page-context.util';
import { ClipboardCheck, Sparkles, SquarePen } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { createElement, useEffect, useMemo, useRef, useState } from 'react';

const WHITESPACE_RUNS_PATTERN = /\s+/g;

interface AgentDraftContextInput {
  body?: string;
  contentFormat?: string;
  draftType: 'article' | 'newsletter' | 'post' | 'thread';
  instructions?: string;
  /** False leaves the agent's page context alone (default true). */
  isEnabled?: boolean;
  onApplySuggestion?: (payload: AgentDraftSuggestionPayload) => void;
  /** Composer placeholder; defaults to a generic one for the draft type. */
  placeholder?: string;
  selectionRootId?: string;
  /** Suggestions about this draft; defaults to Improve / Rewrite / Checklist. */
  suggestedActions?: SuggestedAction[];
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
  const normalized = value?.replace(WHITESPACE_RUNS_PATTERN, ' ').trim();

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
      icon: createElement(SquarePen, {
        className: 'size-5 text-foreground/50',
      }),
      label: 'Improve',
      prompt: `Review the current ${draftType} draft and suggest concrete improvements.`,
    },
    {
      icon: createElement(Sparkles, { className: 'size-5 text-foreground/50' }),
      label: 'Rewrite',
      prompt: `Rewrite the current ${draftType} draft in a sharper brand voice.`,
    },
    {
      icon: createElement(ClipboardCheck, {
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
  isEnabled = true,
  onApplySuggestion,
  placeholder,
  selectionRootId,
  suggestedActions,
  summary,
  title,
}: AgentDraftContextInput): void {
  const pathname = usePathname();
  const setPageContext = useAgentChatStore((s) => s.setPageContext);
  const [selectedText, setSelectedText] = useState<string | undefined>();
  // The route's own context, put back when the draft unmounts (a detail panel
  // closing) so the agent does not keep offering suggestions for a gone draft.
  const routeContextRef = useRef<AgentPageContextState | null | undefined>(
    undefined,
  );

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
      placeholder:
        placeholder ?? `Ask the co-pilot to improve this ${draftType}...`,
      route: pathname,
      selectedText,
      suggestedActions: suggestedActions ?? createDraftActions(draftType),
    }),
    [
      body,
      contentFormat,
      draftType,
      instructions,
      pathname,
      placeholder,
      selectedText,
      suggestedActions,
      summary,
      title,
    ],
  );

  useEffect(() => {
    if (!isEnabled) {
      return;
    }
    if (routeContextRef.current === undefined) {
      routeContextRef.current = useAgentChatStore.getState().pageContext;
    }
    setPageContext(context);
  }, [context, isEnabled, setPageContext]);

  useEffect(() => {
    if (!isEnabled) {
      return;
    }
    return () => {
      const current = useAgentChatStore.getState().pageContext;
      if (current?.route === pathname && current.draftType === draftType) {
        useAgentChatStore
          .getState()
          .setPageContext(routeContextRef.current ?? null);
      }
      routeContextRef.current = undefined;
    };
  }, [draftType, isEnabled, pathname]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isEnabled || !onApplySuggestion) {
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
  }, [isEnabled, onApplySuggestion]);
}
