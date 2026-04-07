import { render, screen } from '@testing-library/react';
import { Badge, badgeVariants } from '@ui/primitives/badge';
import { describe, expect, it } from 'vitest';

describe('Badge', () => {
  it('renders without crashing', () => {
    render(<Badge>Test Badge</Badge>);
    expect(screen.getByText('Test Badge')).toBeInTheDocument();
  });

  it('renders children content', () => {
    render(<Badge>Badge Content</Badge>);
    expect(screen.getByText('Badge Content')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Badge className="custom-badge">Custom</Badge>);
    const badge = screen.getByText('Custom');
    expect(badge).toHaveClass('custom-badge');
  });

  it('preserves default styling with custom className', () => {
    render(<Badge className="custom-badge">Badge</Badge>);
    const badge = screen.getByText('Badge');
    expect(badge).toHaveClass('custom-badge');
    expect(badge).toHaveClass('inline-flex');
  });

  describe('variants', () => {
    it('renders default variant', () => {
      render(<Badge>Default</Badge>);
      const badge = screen.getByText('Default');
      expect(badge).toHaveClass('bg-primary');
      expect(badge).toHaveClass('text-primary-foreground');
    });

    it('renders secondary variant', () => {
      render(<Badge variant="secondary">Secondary</Badge>);
      const badge = screen.getByText('Secondary');
      expect(badge).toHaveClass('bg-secondary');
      expect(badge).toHaveClass('text-secondary-foreground');
    });

    it('renders destructive variant', () => {
      render(<Badge variant="destructive">Destructive</Badge>);
      const badge = screen.getByText('Destructive');
      expect(badge).toHaveClass('bg-destructive');
      expect(badge).toHaveClass('text-destructive-foreground');
    });

    it('renders outline variant', () => {
      render(<Badge variant="outline">Outline</Badge>);
      const badge = screen.getByText('Outline');
      expect(badge).toHaveClass('text-foreground');
    });
  });

  describe('HTML attributes', () => {
    it('forwards id attribute', () => {
      render(<Badge id="badge-1">Badge</Badge>);
      expect(screen.getByText('Badge')).toHaveAttribute('id', 'badge-1');
    });

    it('forwards data attributes', () => {
      render(<Badge data-testid="custom-badge">Badge</Badge>);
      expect(screen.getByTestId('custom-badge')).toBeInTheDocument();
    });

    it('forwards aria attributes', () => {
      render(<Badge aria-label="Status badge">Active</Badge>);
      expect(screen.getByText('Active')).toHaveAttribute(
        'aria-label',
        'Status badge',
      );
    });
  });

  describe('styling', () => {
    it('has base badge styles', () => {
      render(<Badge>Badge</Badge>);
      const badge = screen.getByText('Badge');
      expect(badge).toHaveClass('inline-flex');
      expect(badge).toHaveClass('items-center');
      expect(badge).toHaveClass('border');
    });

    it('has transition styles', () => {
      render(<Badge>Badge</Badge>);
      expect(screen.getByText('Badge')).toHaveClass('transition-colors');
    });

    it('has focus styles', () => {
      render(<Badge>Badge</Badge>);
      expect(screen.getByText('Badge')).toHaveClass('focus:outline-none');
    });

    it('has font weight', () => {
      render(<Badge>Badge</Badge>);
      expect(screen.getByText('Badge')).toHaveClass('font-semibold');
    });
  });

  describe('badgeVariants', () => {
    it('exports badgeVariants function', () => {
      expect(badgeVariants).toBeDefined();
      expect(typeof badgeVariants).toBe('function');
    });

    it('generates variant classes', () => {
      const classes = badgeVariants({ variant: 'default' });
      expect(typeof classes).toBe('string');
    });

    it('generates secondary variant classes', () => {
      const classes = badgeVariants({ variant: 'secondary' });
      expect(classes).toContain('bg-secondary');
    });

    it('generates destructive variant classes', () => {
      const classes = badgeVariants({ variant: 'destructive' });
      expect(classes).toContain('bg-destructive');
    });

    it('generates outline variant classes', () => {
      const classes = badgeVariants({ variant: 'outline' });
      expect(classes).toContain('text-foreground');
    });
  });

  describe('content types', () => {
    it('renders text content', () => {
      render(<Badge>Text Badge</Badge>);
      expect(screen.getByText('Text Badge')).toBeInTheDocument();
    });

    it('renders numeric content', () => {
      render(<Badge>{42}</Badge>);
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('renders icon with text', () => {
      render(
        <Badge>
          <span data-testid="icon">★</span> Featured
        </Badge>,
      );
      expect(screen.getByTestId('icon')).toBeInTheDocument();
      expect(screen.getByText('Featured')).toBeInTheDocument();
    });

    it('renders JSX elements', () => {
      render(
        <Badge>
          <strong>Bold</strong> Text
        </Badge>,
      );
      expect(screen.getByText('Bold')).toBeInTheDocument();
      expect(screen.getByText('Text')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('renders as div by default', () => {
      const { container } = render(<Badge>Badge</Badge>);
      const badge = container.querySelector('div');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('Badge');
    });

    it('supports role attribute', () => {
      render(<Badge role="status">Status</Badge>);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('supports aria-live for dynamic content', () => {
      render(<Badge aria-live="polite">3 new messages</Badge>);
      expect(screen.getByText('3 new messages')).toHaveAttribute(
        'aria-live',
        'polite',
      );
    });
  });
});
