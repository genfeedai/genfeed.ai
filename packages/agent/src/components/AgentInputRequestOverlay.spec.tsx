import { AgentInputRequestOverlay } from '@genfeedai/agent/components/AgentInputRequestOverlay';
import type { AgentInputRequest } from '@genfeedai/agent/models/agent-chat.model';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../apps/app/tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

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
    fireEvent.click(screen.getByText('Use this answer'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      'Use a wider drop zone on desktop only.',
    );
  });

  it('marks the chosen option selected and keeps Other visible', () => {
    const onSubmit = vi.fn();

    render(
      <AgentInputRequestOverlay onSubmit={onSubmit} request={makeRequest()} />,
    );

    fireEvent.click(screen.getByText('Hybrid (Recommended)'));

    expect(screen.getByRole('button', { name: /Hybrid/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByLabelText('Other')).toBeInTheDocument();
  });
});

describe('ask transitions', () => {
  it('resets the answer and selection when a new ask arrives without remounting', () => {
    const onSubmit = vi.fn();
    const { rerender } = render(
      <AgentInputRequestOverlay request={makeRequest()} onSubmit={onSubmit} />,
    );
    fireEvent.change(screen.getByLabelText('Other'), {
      target: { value: 'Old answer' },
    });
    fireEvent.click(screen.getByText('Hybrid (Recommended)'));
    expect(screen.queryByText('Dropzone only')).not.toBeInTheDocument();
    rerender(
      <AgentInputRequestOverlay
        request={makeRequest({ inputRequestId: 'new-ask' })}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByLabelText('Other')).toHaveValue('');
    expect(screen.getByText('Dropzone only')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hybrid/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('restores choices after a failed submit and retries without a stuck selection', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    render(
      <AgentInputRequestOverlay request={makeRequest()} onSubmit={onSubmit} />,
    );
    fireEvent.click(screen.getByText('Hybrid (Recommended)'));
    await screen.findByRole('alert');
    expect(screen.getByText('Dropzone only')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Dropzone only'));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith('Dropzone only'),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores duplicate clicks while an answer is being persisted', () => {
    const onSubmit = vi.fn(() => new Promise<void>(() => undefined));
    render(
      <AgentInputRequestOverlay request={makeRequest()} onSubmit={onSubmit} />,
    );
    fireEvent.click(screen.getByText('Hybrid (Recommended)'));
    fireEvent.click(screen.getByText('Hybrid (Recommended)'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

it('ignores a rejected answer belonging to the previous ask', async () => {
  let rejectOld: ((reason: Error) => void) | undefined;
  const onSubmit = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectOld = reject;
        }),
    )
    .mockImplementation(() => new Promise<void>(() => undefined));
  const { rerender } = render(
    <AgentInputRequestOverlay request={makeRequest()} onSubmit={onSubmit} />,
  );
  fireEvent.click(screen.getByText('Hybrid (Recommended)'));
  rerender(
    <AgentInputRequestOverlay
      request={makeRequest({ inputRequestId: 'new-ask' })}
      onSubmit={onSubmit}
    />,
  );
  fireEvent.click(screen.getByText('Dropzone only'));
  await act(async () => rejectOld?.(new Error('Late rejection')));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Dropzone only/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  fireEvent.click(screen.getByText('Dropzone only'));
  expect(onSubmit).toHaveBeenCalledTimes(2);
});
