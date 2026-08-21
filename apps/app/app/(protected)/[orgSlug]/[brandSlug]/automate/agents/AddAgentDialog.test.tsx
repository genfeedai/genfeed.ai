import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AddAgentDialog from './AddAgentDialog';

const mocks = vi.hoisted(() => ({
  onCreated: vi.fn(),
  onOpenChange: vi.fn(),
}));

vi.mock('@ui/primitives/dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => (
    <div className={className} data-testid="dialog-content">
      {children}
    </div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <header>{children}</header>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

vi.mock('../hire/ContentTeamHirePage', () => ({
  default: ({
    onCancel,
    onCreated,
  }: {
    onCancel: () => void;
    onCreated: () => Promise<void>;
  }) => (
    <div>
      <p>Agent library panel</p>
      <button type="button" onClick={onCancel}>
        Cancel library
      </button>
      <button type="button" onClick={() => onCreated()}>
        Create library agent
      </button>
    </div>
  ),
}));

vi.mock('./new/AgentWizardPage', () => ({
  default: ({ onCreated }: { onCreated: () => Promise<void> }) => (
    <div>
      <p>Custom agent panel</p>
      <button type="button" onClick={() => onCreated()}>
        Create custom agent
      </button>
    </div>
  ),
}));

describe('AddAgentDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.onCreated.mockResolvedValue(undefined);
  });

  it('switches between the library and custom creation flows', () => {
    render(
      <AddAgentDialog
        initialMode="library"
        isOpen
        onCreated={mocks.onCreated}
        onOpenChange={mocks.onOpenChange}
      />,
    );

    expect(screen.getByText('Agent library panel')).toBeVisible();
    expect(screen.getByTestId('dialog-content')).toHaveClass(
      'w-[calc(100vw-2rem)]',
      'max-w-3xl',
    );
    expect(screen.getByTestId('dialog-content')).not.toHaveClass('max-w-5xl');
    // Radix tabs activate on pointer down, not click.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Custom' }));
    expect(screen.getByText('Custom agent panel')).toBeVisible();
  });

  it('refreshes the roster and closes after creating an agent', async () => {
    render(
      <AddAgentDialog
        initialMode="custom"
        isOpen
        onCreated={mocks.onCreated}
        onOpenChange={mocks.onOpenChange}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Create custom agent' }),
    );

    await waitFor(() => {
      expect(mocks.onCreated).toHaveBeenCalledOnce();
      expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('closes the shared dialog from the library cancel action', () => {
    render(
      <AddAgentDialog
        isOpen
        onCreated={mocks.onCreated}
        onOpenChange={mocks.onOpenChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel library' }));
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
  });
});
