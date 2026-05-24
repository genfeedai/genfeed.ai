// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Alert } from '@ui/primitives/alert';
import { describe, expect, it } from 'vitest';

describe('Alert', () => {
  it('uses the shared ship alert styling contract', () => {
    render(<Alert>Heads up</Alert>);

    const alert = screen.getByRole('alert');

    expect(alert.className).toContain('ship-ui');
  });

  it('preserves the local info variant API on top of the shared package', () => {
    render(<Alert variant="info">Info</Alert>);

    const alert = screen.getByRole('alert');

    expect(alert.className).toContain('bg-info/10');
    expect(alert.className).toContain('text-info');
  });
});
