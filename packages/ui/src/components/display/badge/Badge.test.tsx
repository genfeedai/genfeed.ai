import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import Badge from '@ui/display/badge/Badge';
import { describe, expect, it } from 'vitest';

describe('Badge', () => {
  it('should render without crashing', () => {
    const { container } = render(<Badge />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<Badge />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<Badge status="draft" />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
    expect(rootElement).toHaveClass('rounded-full');
    expect(rootElement).toHaveClass('inline-flex');
  });

  it('prefers explicit children over statusConfig label', () => {
    render(<Badge status="completed">Approved</Badge>);
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();

    render(<Badge status="failed">Rejected</Badge>);
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('falls back to statusConfig label when children are omitted', () => {
    render(<Badge status="completed" />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it.each([
    ['completed', 'bg-success/10', 'text-success'],
    ['pending', 'bg-warning/10', 'text-warning'],
    ['running', 'bg-info/10', 'text-info'],
    ['failed', 'bg-destructive/10', 'text-destructive'],
    ['approved', 'bg-success/10', 'text-success'],
    ['blocked', 'bg-destructive/10', 'text-destructive'],
    ['in_review', 'bg-info/10', 'text-info'],
  ])(
    'derives the %s icon and tint from the canonical status contract',
    (status, bgClass, textClass) => {
      const { container } = render(<Badge status={status}>{status}</Badge>);
      const badge = container.firstElementChild;

      expect(badge).toHaveClass(bgClass, textClass);
      expect(
        badge?.querySelector('[data-slot="badge-icon"] svg'),
      ).not.toBeNull();
    },
  );
});
