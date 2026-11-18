import type { AgentChatInputPrefill } from '@genfeedai/agent/components/useAgentChatInput';
import type { PersistedConversationComposerContentReference } from '@genfeedai/agent/models/conversation-composer.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import {
  CONVERSATION_COMPOSER_DRAFT_UPDATED_EVENT,
  readConversationComposerDraft,
} from '@genfeedai/agent/stores/conversation-composer-draft.store';
import type { Editor } from '@tiptap/core';
import { type Dispatch, type SetStateAction, useEffect, useRef } from 'react';

interface UseAgentChatEditorInputsOptions {
  disabled: boolean | undefined;
  draftScopeKey: string | null;
  editor: Editor | null;
  editorRef: { current: Editor | null };
  prefill: AgentChatInputPrefill | undefined;
  setContentReferences: Dispatch<
    SetStateAction<PersistedConversationComposerContentReference[]>
  >;
}

/**
 * Feeds outside input into the composer editor: records attached to the draft
 * from elsewhere, seeded and prefilled content, and the disabled state.
 */
export function useAgentChatEditorInputs({
  disabled,
  draftScopeKey,
  editor,
  editorRef,
  prefill,
  setContentReferences,
}: UseAgentChatEditorInputsOptions): void {
  const activeThreadId = useAgentChatStore((s) => s.activeThreadId);
  const composerSeed = useAgentChatStore((s) => s.composerSeed);
  const clearComposerSeed = useAgentChatStore((s) => s.clearComposerSeed);
  const appliedPrefillNonceRef = useRef<number | null>(null);

  // A record attached to this scope's draft from elsewhere in the app (e.g.
  // Library "Add to conversation") while this composer is mounted — merge it
  // in live instead of waiting for a remount to re-read the draft.
  // use-effect-audit: ignore subscribes to browser events
  useEffect(() => {
    if (typeof window === 'undefined' || draftScopeKey === null) {
      return;
    }

    const handleDraftUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ scopeKey: string | null }>).detail;
      if (detail?.scopeKey !== draftScopeKey) {
        return;
      }

      const draft = readConversationComposerDraft(draftScopeKey);
      setContentReferences((current) => {
        const byId = new Map(current.map((item) => [item.id, item] as const));
        for (const item of draft.contentReferences) {
          if (!byId.has(item.id)) {
            byId.set(item.id, item);
          }
        }
        return [...byId.values()];
      });
      editorRef.current?.commands.focus('end');
    };

    window.addEventListener(
      CONVERSATION_COMPOSER_DRAFT_UPDATED_EVENT,
      handleDraftUpdated,
    );
    return () => {
      window.removeEventListener(
        CONVERSATION_COMPOSER_DRAFT_UPDATED_EVENT,
        handleDraftUpdated,
      );
    };
  }, [draftScopeKey, editorRef, setContentReferences]);

  // use-effect-audit: ignore drives the editor from the seeded content
  useEffect(() => {
    if (!editor || !composerSeed) {
      return;
    }

    const matchesThread =
      composerSeed.threadId === null ||
      composerSeed.threadId === activeThreadId;

    if (!matchesThread) {
      return;
    }

    editor.commands.setContent(composerSeed.content);
    editor.commands.focus('end');
    clearComposerSeed();
  }, [activeThreadId, clearComposerSeed, composerSeed, editor]);

  // use-effect-audit: ignore drives the editor from the prefilled content
  useEffect(() => {
    if (
      !editor ||
      !prefill ||
      appliedPrefillNonceRef.current === prefill.nonce
    ) {
      return;
    }

    appliedPrefillNonceRef.current = prefill.nonce;
    editor.commands.setContent(prefill.content);
    editor.commands.focus('end');
  }, [editor, prefill]);

  // Sync disabled state
  // use-effect-audit: ignore drives a DOM element or browser API
  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
      editor.view.dom.setAttribute('aria-disabled', String(Boolean(disabled)));
    }
  }, [editor, disabled]);
}
