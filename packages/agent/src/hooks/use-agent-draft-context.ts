'use client';

import type { SuggestedAction } from '@genfeedai/agent/models/agent-suggested-action.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo } from 'react';
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
  summary?: string;
  title?: string;
}

const MAX_CONTEXT_TEXT_LENGTH = 4_000;

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
  summary,
  title,
}: AgentDraftContextInput): void {
  const pathname = usePathname();
  const setPageContext = useAgentChatStore((s) => s.setPageContext);

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
      suggestedActions: createDraftActions(draftType),
    }),
    [body, contentFormat, draftType, instructions, pathname, summary, title],
  );

  useEffect(() => {
    setPageContext(context);
  }, [context, setPageContext]);
}
