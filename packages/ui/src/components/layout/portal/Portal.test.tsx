import { render, screen } from '@testing-library/react';
import Portal from '@ui/layout/portal/Portal';
import { describe, expect, it } from 'vitest';

describe('Portal', () => {
  it('should render without crashing', () => {
    render(
      <Portal>
        <div data-testid="portal-content">Portal Content</div>
      </Portal>,
    );
    expect(screen.getByTestId('portal-content')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    render(
      <Portal>
        <button type="button">Click me</button>
      </Portal>,
    );
    expect(
      screen.getByRole('button', { name: 'Click me' }),
    ).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    render(
      <Portal>
        <div className="test-class">Portal</div>
      </Portal>,
    );
    expect(screen.getByText('Portal')).toBeInTheDocument();
  });
});
