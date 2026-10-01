import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AgentConversationBubble from '@/components/workspace-shell/AgentConversationBubble';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('AgentConversationBubble keyboard shortcuts', () => {
  it('keeps the arc usable while tabbing within it and hides it after focus leaves', async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTimeAsync,
    });
    const shiftTab = async () => {
      let settled = false;
      const navigation = user.tab({ shift: true }).finally(() => {
        settled = true;
      });
      await act(async () => {
        // React Testing Library adds a timer after user-event finishes.
        // Drain those ticks without reaching the 200ms shortcut hide delay.
        for (let tick = 0; tick < 20 && !settled; tick += 1) {
          await vi.advanceTimersByTimeAsync(1);
        }
      });
      expect(settled).toBe(true);
      await navigation;
    };
    const view = render(
      <>
        <button type="button">Outside</button>
        <AgentConversationBubble
          onOpen={vi.fn()}
          suggestedActions={[
            {
              id: 'summary',
              label: 'Summarize',
              prompt: 'Summarize this page',
            },
            { id: 'ideas', label: 'Ideas', prompt: 'Suggest ideas' },
          ]}
        />
      </>,
    );

    try {
      const launcher = screen.getByTestId('agent-conversation-bubble');
      act(() => launcher.focus());
      const shortcuts = screen.getAllByTestId('agent-conversation-radial');

      await shiftTab();
      expect(shortcuts[1]).toHaveFocus();
      act(() => vi.advanceTimersByTime(300));
      expect(shortcuts[1].parentElement).not.toHaveAttribute('inert');
      expect(shortcuts[1].parentElement).toHaveClass('opacity-100');
      expect(shortcuts[1]).toHaveAttribute('tabindex', '0');

      await shiftTab();
      expect(shortcuts[0]).toHaveFocus();
      act(() => vi.advanceTimersByTime(300));
      expect(shortcuts[0].parentElement).not.toHaveAttribute('inert');

      await shiftTab();
      expect(screen.getByRole('button', { name: 'Outside' })).toHaveFocus();
      act(() => vi.advanceTimersByTime(200));
      expect(shortcuts[0].parentElement).toHaveAttribute('inert');
      expect(shortcuts[0]).toHaveAttribute('tabindex', '-1');
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });

  it('does not let a pointer-leave timer hide a focused shortcut', () => {
    vi.useFakeTimers();
    const view = render(
      <AgentConversationBubble
        onOpen={vi.fn()}
        suggestedActions={[
          { id: 'summary', label: 'Summarize', prompt: 'Summarize this page' },
        ]}
      />,
    );

    try {
      const launcher = screen.getByTestId('agent-conversation-bubble');
      act(() => launcher.focus());
      const shortcut = screen.getByTestId('agent-conversation-radial');
      act(() => shortcut.focus());
      fireEvent.pointerLeave(shortcut.parentElement as HTMLElement);
      act(() => vi.advanceTimersByTime(300));
      expect(shortcut).toHaveFocus();
      expect(shortcut.parentElement).not.toHaveAttribute('inert');
      expect(shortcut.parentElement).toHaveClass('opacity-100');
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });
});
