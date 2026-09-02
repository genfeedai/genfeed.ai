import { AlertCategory } from '@genfeedai/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import Alert from '@ui/feedback/alert/Alert';
import { describe, expect, it, vi } from 'vitest';

describe('Alert', () => {
  it('renders information as a polite status region', () => {
    render(<Alert>Information</Alert>);

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it.each([AlertCategory.ERROR, AlertCategory.WARNING])(
    'renders %s as an assertive alert region',
    (type) => {
      render(<Alert type={type}>{type}</Alert>);

      expect(screen.getByRole('alert')).not.toHaveAttribute('aria-live');
    },
  );

  it.each([AlertCategory.INFO, AlertCategory.SUCCESS])(
    'renders %s as a polite status region',
    (type) => {
      render(<Alert type={type}>{type}</Alert>);

      expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    },
  );

  it('keeps severity, content, and close action in separate grid columns', () => {
    const handleClose = vi.fn();

    const { container } = render(
      <Alert onClose={handleClose} type={AlertCategory.ERROR}>
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

  it('preserves custom icon geometry inside the non-triggering icon slot', () => {
    const { container } = render(
      <Alert icon={<svg className="size-7" data-testid="custom-alert-icon" />}>
        Custom icon
      </Alert>,
    );

    const severitySlot = container.querySelector('[data-slot="alert-icon"]');
    const customIcon = screen.getByTestId('custom-alert-icon');

    expect(severitySlot?.tagName).toBe('SPAN');
    expect(customIcon).toHaveClass('size-7');
  });

  it('uses the default 20px severity icon when a null icon is supplied', () => {
    const { container } = render(<Alert icon={null}>Default icon</Alert>);

    expect(container.querySelector('[data-slot="alert-icon"]')).toHaveClass(
      '[&>svg]:size-5',
    );
  });
});
