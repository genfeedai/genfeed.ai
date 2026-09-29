import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClipModeSelector from './ClipModeSelector';

describe('ClipModeSelector', () => {
  it('shows raw-cut as selected and explains that identity is not required', () => {
    render(<ClipModeSelector mode="raw-cut" onModeChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /raw cut/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByText(/no avatar or voice required/i),
    ).toBeInTheDocument();
  });
});
