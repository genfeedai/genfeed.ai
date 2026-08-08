import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentArchivedComposerBar } from './AgentArchivedComposerBar';

vi.mock('@genfeedai/agent/components/ConversationComposerShellContext', () => ({
  useConversationComposerShell: () => null,
}));

vi.mock('@ui/layout/prompt-bar-container/PromptBarContainer', () => ({
  default: function MockPromptBarContainer(props: {
    children?: React.ReactNode;
  }) {
    return <div data-testid="prompt-bar-container">{props.children}</div>;
  },
}));

vi.mock('@ui/feedback/alert/Alert', () => ({
  default: function MockAlert(props: { children?: React.ReactNode }) {
    return <div role="alert">{props.children}</div>;
  },
}));

vi.mock('@ui/primitives/button', () => ({
  Button: function MockButton(props: {
    ariaLabel?: string;
    isDisabled?: boolean;
    isLoading?: boolean;
    label?: string;
    onClick?: () => void;
  }) {
    return (
      <button
        type="button"
        aria-label={props.ariaLabel}
        disabled={props.isDisabled || props.isLoading}
        onClick={props.onClick}
      >
        {props.label}
      </button>
    );
  },
}));

describe('AgentArchivedComposerBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the archive notice and unarchive control', () => {
    render(
      <AgentArchivedComposerBar
        message="This thread is archived."
        onUnarchive={vi.fn()}
      />,
    );

    expect(screen.getByText('This thread is archived.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Unarchive thread' }),
    ).toBeInTheDocument();
  });

  it('calls onUnarchive when the button is pressed', async () => {
    const onUnarchive = vi.fn().mockResolvedValue(undefined);

    render(<AgentArchivedComposerBar onUnarchive={onUnarchive} />);

    fireEvent.click(screen.getByRole('button', { name: 'Unarchive thread' }));

    await waitFor(() => {
      expect(onUnarchive).toHaveBeenCalledOnce();
    });
  });

  it('surfaces an error when unarchive fails', async () => {
    const onUnarchive = vi.fn().mockRejectedValue(new Error('boom'));

    render(<AgentArchivedComposerBar onUnarchive={onUnarchive} />);

    fireEvent.click(screen.getByRole('button', { name: 'Unarchive thread' }));

    expect(
      await screen.findByText('Could not unarchive this thread. Try again.'),
    ).toBeInTheDocument();
  });
});
