import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AddAgentDialog from './AddAgentDialog';

const mocks = vi.hoisted(() => ({
  openAgentComposer: vi.fn(),
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
  default: ({ onCreated }: { onCreated: () => Promise<void> }) => (
    <div>
      <p>Agent marketplace panel</p>
      <button type="button" onClick={() => onCreated()}>
        Create library agent
      </button>
    </div>
  ),
}));

vi.mock('@/hooks/use-open-agent-composer', () => ({
  useOpenAgentComposer: () => mocks.openAgentComposer,
}));

describe('AddAgentDialog', () => {
  it('preserves marketplace creation and roster refresh', async () => {
    render(
      <AddAgentDialog
        isOpen
        onCreated={mocks.onCreated}
        onOpenChange={mocks.onOpenChange}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Create library agent' }),
    );
    await waitFor(() => expect(mocks.onCreated).toHaveBeenCalledOnce());
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.openAgentComposer).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.onCreated.mockResolvedValue(undefined);
  });

  it('switches between the marketplace and custom creation flows', () => {
    render(
      <AddAgentDialog
        initialMode="library"
        isOpen
        onCreated={mocks.onCreated}
        onOpenChange={mocks.onOpenChange}
      />,
    );

    expect(screen.getByText('Agent marketplace panel')).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Marketplace' })).toBeVisible();
    expect(screen.getByTestId('dialog-content')).toHaveClass(
      'w-[calc(100vw-2rem)]',
      'max-w-4xl',
    );
    expect(screen.getByTestId('dialog-content')).not.toHaveClass('max-w-5xl');
    // Radix tabs activate on pointer down, not click.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Custom' }));
    expect(
      screen.getByRole('button', { name: 'Hire with agent' }),
    ).toBeVisible();
  });

  it('opens the composer with an approval-first recurring-content prompt and closes', async () => {
    render(
      <AddAgentDialog
        initialMode="custom"
        isOpen
        onCreated={mocks.onCreated}
        onOpenChange={mocks.onOpenChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hire with agent' }));

    await waitFor(() => {
      expect(mocks.openAgentComposer).toHaveBeenCalledWith(
        'Help me hire an agent to create recurring content for this brand. Ask for my platforms, topics, voice, cadence, and credit budget, then show the recurring task for approval.',
      );
      expect(mocks.onCreated).not.toHaveBeenCalled();
      expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
