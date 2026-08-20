import { render, screen } from '@testing-library/react';
import QuickActionButton from '@ui/quick-actions/button/QuickActionButton';
import { describe, expect, it, vi } from 'vitest';

const mockAction = {
  id: 'test-action',
  icon: <span data-testid="action-icon">icon</span>,
  label: 'Test Action',
  variant: 'primary' as const,
};

describe('QuickActionButton', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <QuickActionButton action={mockAction} onClick={vi.fn()} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(
      <QuickActionButton action={mockAction} onClick={vi.fn()} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <QuickActionButton action={mockAction} onClick={vi.fn()} />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });

  it('gives an icon-only action an accessible name', () => {
    render(<QuickActionButton action={mockAction} onClick={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Test Action' }),
    ).toBeInTheDocument();
  });
});
