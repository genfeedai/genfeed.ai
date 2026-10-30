import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import CalendarRepublishDialog from './calendar-republish-dialog';
import '@testing-library/jest-dom/vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@ui/primitives/dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@ui/primitives/alert', () => ({
  Alert: ({ children }: { children: ReactNode }) => (
    <div role="alert">{children}</div>
  ),
  AlertDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  AlertTitle: ({ children }: { children: ReactNode }) => (
    <strong>{children}</strong>
  ),
}));

describe('CalendarRepublishDialog', () => {
  it('names both outcomes in plain language when open', () => {
    const onCancel = vi.fn();
    const onChooseCardOnly = vi.fn();
    const onChooseRepublish = vi.fn();

    render(
      <CalendarRepublishDialog
        isOpen
        onCancel={onCancel}
        onChooseCardOnly={onChooseCardOnly}
        onChooseRepublish={onChooseRepublish}
        pendingAction={null}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Move the card or publish again?' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Move card only keeps the live post as-is and does not publish.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Move card only' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onChooseCardOnly).toHaveBeenCalledTimes(1);
    expect(onChooseRepublish).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('hides the choice while closed', () => {
    render(
      <CalendarRepublishDialog
        isOpen={false}
        onCancel={vi.fn()}
        onChooseCardOnly={vi.fn()}
        onChooseRepublish={vi.fn()}
        pendingAction={null}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
