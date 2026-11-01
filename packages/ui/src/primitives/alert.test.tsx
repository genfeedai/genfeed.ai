// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { describe, expect, it, vi } from 'vitest';

describe('Alert', () => {
  it('uses a polite status region for neutral information', () => {
    render(<Alert>Heads up</Alert>);

    const alert = screen.getByRole('status');

    expect(alert.className).toContain('relative');
    expect(alert).toHaveAttribute('aria-live', 'polite');
  });

  it('preserves the info variant as a polite status region', () => {
    render(<Alert variant="info">Info</Alert>);

    const alert = screen.getByRole('status');

    expect(alert.className).toContain('bg-info/10');
    expect(alert.className).toContain('text-info');
    expect(alert).toHaveAttribute('aria-live', 'polite');
  });

  it.each(['destructive', 'warning'] as const)(
    'uses an assertive alert region for %s severity',
    (variant) => {
      render(<Alert variant={variant}>{variant}</Alert>);

      expect(screen.getByRole('alert')).not.toHaveAttribute('aria-live');
    },
  );

  it('keeps severity, content, and close action in separate grid columns', () => {
    const handleClose = vi.fn();

    const { container } = render(
      <Alert
        closeLabel="Dismiss alert"
        onClose={handleClose}
        variant="destructive"
      >
        Data save failed
      </Alert>,
    );

    const rootElement = screen.getByRole('alert');
    const severitySlot = container.querySelector('[data-slot="alert-icon"]');
    const closeButton = screen.getByRole('button', { name: 'Dismiss alert' });

    expect(rootElement).toHaveClass(
      'grid',
      'grid-cols-[auto_minmax(0,1fr)_auto]',
    );
    expect(severitySlot).toHaveAttribute('aria-hidden', 'true');
    expect(severitySlot).toHaveClass('shrink-0');
    expect(closeButton).toHaveClass('size-7', 'shrink-0');

    fireEvent.click(closeButton);
    expect(handleClose).toHaveBeenCalledOnce();
  });

  it('puts a custom icon in the icon slot', () => {
    const { container } = render(
      <Alert icon={<svg className="size-7" data-testid="custom-alert-icon" />}>
        Custom icon
      </Alert>,
    );

    const severitySlot = container.querySelector('[data-slot="alert-icon"]');

    expect(severitySlot?.tagName).toBe('SPAN');
    expect(screen.getByTestId('custom-alert-icon')).toHaveClass('size-7');
  });

  it('uses the default 20px severity icon when no icon is supplied', () => {
    const { container } = render(<Alert variant="warning">Default icon</Alert>);

    expect(container.querySelector('[data-slot="alert-icon"]')).toHaveClass(
      '[&>svg]:size-5',
    );
  });

  it('renders no icon column when the icon is false', () => {
    const { container } = render(
      <Alert icon={false} variant="info">
        No icon
      </Alert>,
    );

    expect(container.querySelector('[data-slot="alert-icon"]')).toBeNull();
    expect(screen.getByRole('status')).toHaveClass(
      'grid-cols-[minmax(0,1fr)_auto]',
    );
  });

  it('renders title and description inside the content column', () => {
    render(
      <Alert>
        <AlertTitle>A title that may wrap</AlertTitle>
        <AlertDescription>Recovery guidance</AlertDescription>
      </Alert>,
    );

    expect(screen.getByText('A title that may wrap')).toHaveClass(
      'font-medium',
    );
    expect(screen.getByText('A title that may wrap')).not.toHaveClass(
      'line-clamp-1',
    );
    expect(screen.getByText('Recovery guidance')).toBeInTheDocument();
  });

  it('preserves an explicit caller role override', () => {
    render(<Alert role="region">Persistent guidance</Alert>);

    expect(screen.getByRole('region')).not.toHaveAttribute('aria-live');
  });
});
