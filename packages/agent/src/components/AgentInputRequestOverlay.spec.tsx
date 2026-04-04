import { AgentInputRequestOverlay } from '@genfeedai/agent/components/AgentInputRequestOverlay';
import type { AgentInputRequest } from '@genfeedai/agent/models/agent-chat.model';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/buttons/base/Button', () => ({
  default: function MockButton(props: {
    ariaLabel?: string;
    children?: ReactNode;
    className?: string;
    isDisabled?: boolean;
    onClick?: () => void | Promise<void>;
  }) {
    return (
      <button
        type="button"
        aria-label={props.ariaLabel}
        className={props.className}
        disabled={props.isDisabled}
        onClick={props.onClick}
      >
        {props.children}
      </button>
    );
  },
}));

function makeRequest(
  overrides: Partial<AgentInputRequest> = {},
): AgentInputRequest {
  return {
    allowFreeText: true,
    inputRequestId: 'input-request-1',
    options: [
      {
        description:
          'Keep the explicit upload control and allow drag and drop.',
        id: 'hybrid',
        label: 'Hybrid',
      },
      {
        description: 'Use drag and drop only.',
        id: 'dropzone',
        label: 'Dropzone only',
      },
    ],
    prompt: 'Which interaction model should the prompt bar optimize for?',
    recommendedOptionId: 'hybrid',
    runId: 'run-1',
    threadId: 'thread-1',
    title: 'Interaction',
    ...overrides,
  };
}

describe('AgentInputRequestOverlay', () => {
  it('submits the selected option immediately', () => {
    const onSubmit = vi.fn();

    render(
      <AgentInputRequestOverlay onSubmit={onSubmit} request={makeRequest()} />,
    );

    fireEvent.click(screen.getByText('Hybrid (Recommended)'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('Hybrid');
  });

  it('submits the free-text answer when provided', () => {
    const onSubmit = vi.fn();

    render(
      <AgentInputRequestOverlay onSubmit={onSubmit} request={makeRequest()} />,
    );

    fireEvent.change(screen.getByPlaceholderText(/type your own answer/i), {
      target: { value: 'Use a wider drop zone on desktop only.' },
    });
    fireEvent.click(screen.getByText('Submit answers'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      'Use a wider drop zone on desktop only.',
    );
  });
});
