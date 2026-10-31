import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RepliesReplyComposer from './replies-reply-composer';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

// The TipTap editor needs a real DOM layout; a textarea keeps these tests on
// the composer's own behaviour.
vi.mock('@ui/prompt-editor/PromptEditor', () => ({
  default: ({
    ariaLabel,
    onSubmit,
    onValueChange,
    value,
  }: {
    ariaLabel?: string;
    onSubmit?: () => void;
    onValueChange?: (value: string) => void;
    value?: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onValueChange?.(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onSubmit?.();
        }
      }}
    />
  ),
}));

function setup(overrides: { draft?: string; isBusy?: boolean } = {}) {
  const handlers = {
    onDraft: vi.fn(),
    onDraftChange: vi.fn(),
    onIntentChange: vi.fn(),
    onSend: vi.fn(),
  };
  render(
    <RepliesReplyComposer
      authorUsername="@taylor"
      draft={overrides.draft ?? ''}
      intent="default"
      isBusy={overrides.isBusy ?? false}
      {...handlers}
    />,
  );
  return handlers;
}

describe('RepliesReplyComposer', () => {
  it('renders on the shared prompt bar with the editor named for the author', () => {
    setup();

    expect(
      screen.getByRole('textbox', { name: 'Reply to @taylor' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('prompt-bar-composer')).toBeInTheDocument();
    expect(screen.getByTestId('prompt-bar-toolbar')).toBeInTheDocument();
  });

  it('reports typing and drafts on request', () => {
    const { onDraft, onDraftChange } = setup();

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Thanks!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'actions.draft' }));

    expect(onDraftChange).toHaveBeenCalledWith('Thanks!');
    expect(onDraft).toHaveBeenCalledTimes(1);
  });

  it('sends from the send button and on Enter once there is a draft', () => {
    const { onSend } = setup({ draft: 'Thanks!' });

    fireEvent.click(screen.getByRole('button', { name: 'actions.send' }));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

    expect(onSend).toHaveBeenCalledTimes(2);
  });

  it('holds back sending without a draft or while busy', () => {
    const empty = setup();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(empty.onSend).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'actions.send' })).toBeDisabled();
  });
});
