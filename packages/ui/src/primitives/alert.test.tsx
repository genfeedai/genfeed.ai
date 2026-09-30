// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { describe, expect, it } from 'vitest';

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

  it('keeps icon, title, and description in the shadcn grid contract', () => {
    render(
      <Alert>
        <svg aria-hidden="true" data-testid="severity-icon" />
        <AlertTitle>A title that may wrap</AlertTitle>
        <AlertDescription>Recovery guidance</AlertDescription>
      </Alert>,
    );

    const alert = screen.getByRole('status');

    expect(alert).toHaveClass('grid', 'grid-cols-[0_1fr]');
    expect(alert.className).toContain('has-[>svg]:grid-cols-');
    expect(alert.className).not.toContain('[&>svg]:absolute');
    expect(alert.className).not.toContain('[&:has(svg)]:pl-11');
    expect(screen.getByText('A title that may wrap')).toHaveClass(
      'col-start-2',
    );
    expect(screen.getByText('A title that may wrap')).not.toHaveClass(
      'line-clamp-1',
    );
    expect(screen.getByText('Recovery guidance')).toHaveClass('col-start-2');
  });

  it('preserves an explicit caller role override', () => {
    render(<Alert role="region">Persistent guidance</Alert>);

    expect(screen.getByRole('region')).not.toHaveAttribute('aria-live');
  });
});
