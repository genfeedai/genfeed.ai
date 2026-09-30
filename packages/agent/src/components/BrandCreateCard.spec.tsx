import { BrandCreateCard } from '@genfeedai/agent/components/BrandCreateCard';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

function makeAction(overrides: Partial<AgentUiAction> = {}): AgentUiAction {
  return {
    brandDescription: 'A tasty brand',
    brandName: 'Acme',
    id: 'brand-create-1',
    title: 'Create Brand',
    type: 'brand_create_card',
    ...overrides,
  } as AgentUiAction;
}

describe('BrandCreateCard', () => {
  it('invokes onCreate with the form values and shows the created state on success', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<BrandCreateCard action={makeAction()} onCreate={onCreate} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create brand/i }));
    });

    expect(onCreate).toHaveBeenCalledWith({
      description: 'A tasty brand',
      name: 'Acme',
    });
    await waitFor(() =>
      expect(screen.getByText(/Brand .*Acme.* created/i)).toBeInTheDocument(),
    );
  });

  it('surfaces an error and keeps the form editable when onCreate rejects', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('server down'));
    render(<BrandCreateCard action={makeAction()} onCreate={onCreate} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create brand/i }));
    });

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /could not create brand/i,
      ),
    );
    // Form remains available for retry.
    expect(screen.getByPlaceholderText('Enter brand name...')).toBeVisible();
  });

  it('disables the create action when the name is empty', () => {
    render(
      <BrandCreateCard
        action={makeAction({ brandName: '' })}
        onCreate={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: /create brand/i }),
    ).toBeDisabled();
  });
});
