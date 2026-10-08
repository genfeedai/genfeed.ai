import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AddAgentDialog from './AddAgentDialog';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  onCreated: vi.fn(),
  onOpenChange: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
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

vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  useCollectionScope: () => ({ brandId: 'brand-1', pageScope: 'brand' }),
  isBrandResourceReady: () => true,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ create: mocks.create }),
}));
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ success: mocks.success, error: mocks.error }),
  },
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
  });
  beforeEach(() => {
    class MockResizeObserver {
      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();
    }

    globalThis.ResizeObserver =
      MockResizeObserver as unknown as typeof ResizeObserver;
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
    expect(screen.getByRole('button', { name: 'Create agent' })).toBeVisible();
  });

  it.each(['refresh', 'create'])(
    'distinguishes a %s failure from a successful creation',
    async (failure) => {
      mocks.create.mockResolvedValue({ id: 'agent-1' });
      if (failure === 'refresh')
        mocks.onCreated.mockRejectedValue(new Error('refresh failed'));
      else mocks.create.mockRejectedValue(new Error('creation failed'));
      render(
        <AddAgentDialog
          initialMode="custom"
          isOpen
          onCreated={mocks.onCreated}
          onOpenChange={mocks.onOpenChange}
        />,
      );
      fireEvent.click(screen.getByRole('checkbox', { name: 'LinkedIn' }));
      fireEvent.change(
        screen.getByRole('textbox', { name: 'Topics (comma-separated)' }),
        { target: { value: 'AI' } },
      );
      fireEvent.change(screen.getByRole('textbox', { name: 'Voice' }), {
        target: { value: 'Direct' },
      });
      const submit = screen.getByRole('button', { name: 'Create agent' });
      fireEvent.click(submit);
      await waitFor(() =>
        expect(
          failure === 'refresh' ? mocks.success : mocks.error,
        ).toHaveBeenCalledOnce(),
      );
      if (failure === 'refresh') {
        expect(mocks.error).not.toHaveBeenCalled();
        expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
        expect(submit).toBeDisabled();
        fireEvent.click(submit);
        expect(mocks.create).toHaveBeenCalledOnce();
      } else {
        expect(mocks.success).not.toHaveBeenCalled();
        expect(mocks.onCreated).not.toHaveBeenCalled();
        expect(mocks.onOpenChange).not.toHaveBeenCalled();
        await waitFor(() => expect(submit).not.toBeDisabled());
      }
      mocks.create.mockReset();
    },
  );

  it('creates a custom strategy, refreshes the roster, and closes', async () => {
    render(
      <AddAgentDialog
        initialMode="custom"
        isOpen
        onCreated={mocks.onCreated}
        onOpenChange={mocks.onOpenChange}
      />,
    );
    expect(
      screen.queryByRole('textbox', { name: 'Platforms' }),
    ).not.toBeInTheDocument();
    const platformLabels = [
      'YouTube',
      'TikTok',
      'Instagram',
      'X (Twitter)',
      'LinkedIn',
      'WordPress',
      'Facebook',
    ];
    const platformOptions = screen.getAllByRole('checkbox');
    expect(platformOptions).toHaveLength(platformLabels.length);
    platformLabels.forEach((label, index) => {
      expect(platformOptions[index]).toHaveAccessibleName(label);
      expect(platformOptions[index]).toBeVisible();
    });
    expect(
      screen.queryByRole('checkbox', { name: 'Google Ads' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Slack' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'X (Twitter)' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'LinkedIn' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'YouTube' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'YouTube' }));
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Topics (comma-separated)' }),
      { target: { value: 'AI, product' } },
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Voice' }), {
      target: { value: 'Direct and friendly' },
    });
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Weekly publishing ceiling' }),
      { target: { value: '6' } },
    );
    expect(screen.getByRole('button', { name: 'Create agent' })).toBeDisabled();
    expect(screen.getByRole('alert')).toBeVisible();
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Weekly publishing ceiling' }),
      { target: { value: '14' } },
    );
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Ready-draft reserve' }),
      { target: { value: '3' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create agent' }));
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: 'brand-1',
          platforms: ['twitter', 'linkedin'],
          topics: ['AI', 'product'],
          voice: 'Direct and friendly',
          dailyCreditBudget: 100,
          weeklyCreditBudget: 500,
          minCreditThreshold: 50,
          postsPerWeek: 7,
          publishingCeilingPerWeek: 14,
          readyDraftReserve: 3,
          runFrequency: 'daily',
          autonomyMode: 'SUPERVISED',
        }),
      ),
    );
    expect(mocks.onCreated).toHaveBeenCalledOnce();
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
  });
});
