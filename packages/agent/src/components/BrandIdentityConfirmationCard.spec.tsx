import { BrandIdentityConfirmationCard } from '@genfeedai/agent/components/BrandIdentityConfirmationCard';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

function makeCreateAction(
  overrides: Partial<AgentUiAction> = {},
): AgentUiAction {
  return {
    ctas: [
      {
        action: 'confirm_create_brand',
        label: 'Confirm create',
        payload: {
          label: 'Acme',
          slug: 'acme',
          sourceActionId: 'source-create-1',
        },
      },
    ],
    data: {
      operation: 'create',
      proposal: {
        description: 'Original description',
        label: 'Acme',
        slug: 'acme',
      },
      sourceActionId: 'source-create-1',
    },
    description: 'Review the identity before creating the brand.',
    id: 'confirmation-create-1',
    title: 'Create this brand?',
    type: 'brand_identity_confirmation_card',
    ...overrides,
  };
}

function makeRenameAction(): AgentUiAction {
  return {
    ctas: [
      {
        action: 'confirm_rename_brand',
        label: 'Confirm rename',
        payload: {
          label: 'Genfeed.ai',
          slug: 'genfeed-ai',
          sourceActionId: 'source-rename-1',
        },
      },
    ],
    data: {
      currentIdentity: {
        label: 'Default Brand',
        slug: 'default-brand',
      },
      operation: 'rename',
      proposal: {
        label: 'Genfeed.ai',
        slug: 'genfeed-ai',
      },
      sourceActionId: 'source-rename-1',
    },
    id: 'confirmation-rename-1',
    title: 'Rename this brand?',
    type: 'brand_identity_confirmation_card',
  };
}

describe('BrandIdentityConfirmationCard', () => {
  it('dispatches edited create fields while preserving the server source action', async () => {
    const onUiAction = vi.fn().mockResolvedValue(true);
    const action = makeCreateAction();

    render(
      <BrandIdentityConfirmationCard action={action} onUiAction={onUiAction} />,
    );

    fireEvent.change(screen.getByLabelText('Brand label'), {
      target: { value: 'Genfeed' },
    });
    fireEvent.change(screen.getByLabelText('Brand slug'), {
      target: { value: 'genfeed' },
    });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'AI content operations' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm create' }));

    await waitFor(() => {
      expect(onUiAction).toHaveBeenCalledWith('confirm_create_brand', {
        description: 'AI content operations',
        label: 'Genfeed',
        slug: 'genfeed',
        sourceActionId: 'source-create-1',
      });
    });
    expect(action.data?.proposal).toEqual({
      description: 'Original description',
      label: 'Acme',
      slug: 'acme',
    });
    expect(
      await screen.findByText('Brand "Genfeed" created.'),
    ).toBeInTheDocument();
  });

  it('dispatches rename edits without adding a create description', async () => {
    const onUiAction = vi.fn().mockResolvedValue(true);

    render(
      <BrandIdentityConfirmationCard
        action={makeRenameAction()}
        onUiAction={onUiAction}
      />,
    );

    expect(screen.getByText(/Current brand:/)).toHaveTextContent(
      'Current brand: Default Brand (default-brand)',
    );
    expect(screen.queryByLabelText('Description')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Brand slug'), {
      target: { value: 'genfeed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm rename' }));

    await waitFor(() => {
      expect(onUiAction).toHaveBeenCalledWith('confirm_rename_brand', {
        label: 'Genfeed.ai',
        slug: 'genfeed',
        sourceActionId: 'source-rename-1',
      });
    });
    expect(
      await screen.findByText('Brand renamed to "Genfeed.ai".'),
    ).toBeInTheDocument();
  });

  it('shows pending state and blocks duplicate confirmations', async () => {
    let resolveAction: (() => void) | undefined;
    const onUiAction = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveAction = () => resolve(true);
        }),
    );

    render(
      <BrandIdentityConfirmationCard
        action={makeCreateAction()}
        onUiAction={onUiAction}
      />,
    );

    const confirmButton = screen.getByRole('button', {
      name: 'Confirm create',
    });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    expect(screen.getByRole('button', { name: /Creating/ })).toBeDisabled();
    expect(onUiAction).toHaveBeenCalledTimes(1);

    resolveAction?.();
    expect(
      await screen.findByText('Brand "Acme" created.'),
    ).toBeInTheDocument();
  });

  it('keeps edits available and shows an error when confirmation fails', async () => {
    const onUiAction = vi.fn().mockRejectedValue(new Error('server rejected'));

    render(
      <BrandIdentityConfirmationCard
        action={makeCreateAction()}
        onUiAction={onUiAction}
      />,
    );

    fireEvent.change(screen.getByLabelText('Brand label'), {
      target: { value: 'Edited brand' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Could not create the brand/i,
    );
    expect(screen.getByLabelText('Brand label')).toHaveValue('Edited brand');
    expect(
      screen.getByRole('button', { name: 'Confirm create' }),
    ).toBeEnabled();
  });

  it('does not report success when the container returns a failed outcome', async () => {
    const onUiAction = vi.fn().mockResolvedValue(false);

    render(
      <BrandIdentityConfirmationCard
        action={makeRenameAction()}
        onUiAction={onUiAction}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirm rename' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Could not rename the brand/i,
    );
    expect(screen.queryByText(/Brand renamed to/i)).not.toBeInTheDocument();
  });

  it('treats an undefined legacy outcome as a failed confirmation', async () => {
    const onUiAction = vi.fn().mockResolvedValue(undefined);

    render(
      <BrandIdentityConfirmationCard
        action={makeCreateAction()}
        onUiAction={onUiAction as never}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirm create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Could not create the brand/i,
    );
    expect(screen.queryByText(/Brand .* created/i)).not.toBeInTheDocument();
  });

  it('stays disabled and cannot report success without a UI action handler', () => {
    render(<BrandIdentityConfirmationCard action={makeCreateAction()} />);

    const confirmButton = screen.getByRole('button', {
      name: 'Confirm create',
    });
    expect(confirmButton).toBeDisabled();

    fireEvent.click(confirmButton);

    expect(screen.queryByText(/created\.$/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Brand label')).toBeDisabled();
  });
});
