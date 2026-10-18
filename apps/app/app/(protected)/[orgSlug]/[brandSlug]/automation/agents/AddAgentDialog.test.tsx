import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AddAgentDialog from './AddAgentDialog';

const mocks = vi.hoisted(() => ({
  onCreated: vi.fn(),
  onOpenChange: vi.fn(),
  openConversation: vi.fn(),
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
  DialogFooter: ({ children }: { children: ReactNode }) => (
    <footer>{children}</footer>
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

vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  useCollectionScope: () => ({ brandId: 'brand-1', pageScope: 'brand' }),
}));

vi.mock('./open-content-agent-conversation', () => ({
  buildContentAgentSetupPrompt: (brandId: string) =>
    `Help me hire an agent. Brand id: ${brandId}.`,
  useOpenContentAgentConversation: () => mocks.openConversation,
}));

describe('AddAgentDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.onCreated.mockResolvedValue(undefined);
  });

  it('activates a marketplace agent in one click and refreshes the roster', async () => {
    render(
      <AddAgentDialog
        isOpen
        onCreated={mocks.onCreated}
        onOpenChange={mocks.onOpenChange}
      />,
    );

    expect(screen.getByText('Agent marketplace panel')).toBeVisible();
    expect(screen.getByTestId('dialog-content')).toHaveClass(
      'w-[calc(100vw-2rem)]',
      'max-w-4xl',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Create library agent' }),
    );
    await waitFor(() => expect(mocks.onCreated).toHaveBeenCalledOnce());
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.openConversation).not.toHaveBeenCalled();
  });

  it('hires a custom agent from the conversation instead of a setup form', () => {
    render(
      <AddAgentDialog
        isOpen
        onCreated={mocks.onCreated}
        onOpenChange={mocks.onOpenChange}
      />,
    );

    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Add agent' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Hire from chat' }));
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.openConversation).toHaveBeenCalledWith(
      'Help me hire an agent. Brand id: brand-1.',
    );
    expect(mocks.onCreated).not.toHaveBeenCalled();
  });
});
