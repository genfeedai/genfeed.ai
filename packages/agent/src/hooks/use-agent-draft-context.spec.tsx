import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_DRAFT_SUGGESTION_EVENT,
  type AgentDraftSuggestionPayload,
  useAgentDraftContext,
} from './use-agent-draft-context';

function getPageContext() {
  return useAgentChatStore.getState().pageContext as Record<string, unknown>;
}

describe('useAgentDraftContext', () => {
  beforeEach(() => {
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
  });

  it('publishes the draft context to the agent store', () => {
    renderHook(() =>
      useAgentDraftContext({
        body: '  A   body   with   gaps  ',
        contentFormat: 'markdown',
        draftType: 'article',
        instructions: 'Keep it short',
        summary: 'A summary',
        title: 'My title',
      }),
    );

    const context = getPageContext();
    expect(context).toMatchObject({
      contentFormat: 'markdown',
      draftBody: 'A body with gaps',
      draftInstructions: 'Keep it short',
      draftSummary: 'A summary',
      draftTitle: 'My title',
      draftType: 'article',
      placeholder: 'Ask the co-pilot to improve this article...',
    });
    const actions = context.suggestedActions as Array<{ label: string }>;
    expect(actions.map((action) => action.label)).toEqual([
      'Improve',
      'Rewrite',
      'Checklist',
    ]);
  });

  it('drops empty fields and truncates very long text', () => {
    renderHook(() =>
      useAgentDraftContext({
        body: 'x'.repeat(5000),
        draftType: 'post',
        title: '   ',
      }),
    );

    const context = getPageContext();
    expect(context.draftTitle).toBeUndefined();
    expect((context.draftBody as string).length).toBe(4003);
    expect((context.draftBody as string).endsWith('...')).toBe(true);
  });

  it('captures document text selection into the context', () => {
    renderHook(() => useAgentDraftContext({ draftType: 'post' }));

    const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue({
      anchorNode: null,
      focusNode: null,
      toString: () => 'picked words',
    } as unknown as Selection);

    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });

    expect(getPageContext().selectedText).toBe('picked words');

    getSelectionSpy.mockReturnValue({
      toString: () => '',
    } as unknown as Selection);
    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });
    expect(getPageContext().selectedText).toBeUndefined();

    getSelectionSpy.mockRestore();
  });

  it('ignores selections outside the configured selection root', () => {
    const root = document.createElement('div');
    root.id = 'draft-root';
    const inside = document.createTextNode('inside');
    root.appendChild(inside);
    document.body.appendChild(root);
    const outside = document.createElement('p');
    outside.textContent = 'outside';
    document.body.appendChild(outside);

    renderHook(() =>
      useAgentDraftContext({
        draftType: 'post',
        selectionRootId: 'draft-root',
      }),
    );

    const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue({
      anchorNode: outside.firstChild,
      focusNode: outside.firstChild,
      toString: () => 'outside text',
    } as unknown as Selection);

    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });
    expect(getPageContext().selectedText).toBeUndefined();

    getSelectionSpy.mockReturnValue({
      anchorNode: inside,
      focusNode: inside,
      toString: () => 'inside',
    } as unknown as Selection);
    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });
    expect(getPageContext().selectedText).toBe('inside');

    getSelectionSpy.mockRestore();
    root.remove();
    outside.remove();
  });

  it('applies draft suggestions delivered via the custom event', () => {
    const onApplySuggestion = vi.fn();
    renderHook(() =>
      useAgentDraftContext({ draftType: 'newsletter', onApplySuggestion }),
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent<AgentDraftSuggestionPayload>(
          AGENT_DRAFT_SUGGESTION_EVENT,
          {
            cancelable: true,
            detail: {
              mode: 'replace',
              sourceAction: 'Rewrite',
              text: '  Fresh copy  ',
            },
          },
        ),
      );
    });

    expect(onApplySuggestion).toHaveBeenCalledWith({
      mode: 'replace',
      selectedText: undefined,
      sourceAction: 'Rewrite',
      text: 'Fresh copy',
    });
  });

  it('ignores suggestion events with empty text', () => {
    const onApplySuggestion = vi.fn();
    renderHook(() =>
      useAgentDraftContext({ draftType: 'thread', onApplySuggestion }),
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent<AgentDraftSuggestionPayload>(
          AGENT_DRAFT_SUGGESTION_EVENT,
          { detail: { text: '   ' } },
        ),
      );
    });

    expect(onApplySuggestion).not.toHaveBeenCalled();
  });

  it('does not listen for suggestions without a handler', () => {
    renderHook(() => useAgentDraftContext({ draftType: 'post' }));

    expect(() =>
      act(() => {
        window.dispatchEvent(
          new CustomEvent<AgentDraftSuggestionPayload>(
            AGENT_DRAFT_SUGGESTION_EVENT,
            { detail: { text: 'anything' } },
          ),
        );
      }),
    ).not.toThrow();
  });
});
