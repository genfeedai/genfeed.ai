import { render, screen } from '@testing-library/react';
import { Heading } from '@ui/typography/heading';
import { describe, expect, it, vi } from 'vitest';

describe('Heading', () => {
  it('renders without crashing', () => {
    render(<Heading>Title</Heading>);
    expect(screen.getByRole('heading')).toBeInTheDocument();
  });

  it('renders children text', () => {
    render(<Heading>Page Title</Heading>);
    expect(screen.getByText('Page Title')).toBeInTheDocument();
  });

  it('has font-semibold by default', () => {
    render(<Heading>Title</Heading>);
    expect(screen.getByRole('heading')).toHaveClass('font-semibold');
  });

  it('applies custom className', () => {
    render(<Heading className="custom-heading">Title</Heading>);
    expect(screen.getByRole('heading')).toHaveClass('custom-heading');
  });

  describe('size variants and element mapping', () => {
    it('renders h3 for lg size (default)', () => {
      render(<Heading size="lg">H3 Heading</Heading>);
      expect(screen.getByText('H3 Heading').tagName).toBe('H3');
    });

    it('renders h4 for md size', () => {
      render(<Heading size="md">H4 Heading</Heading>);
      expect(screen.getByText('H4 Heading').tagName).toBe('H4');
    });

    it('renders h5 for sm size', () => {
      render(<Heading size="sm">H5 Heading</Heading>);
      expect(screen.getByText('H5 Heading').tagName).toBe('H5');
    });

    it('renders h3 for xl size', () => {
      render(<Heading size="xl">H3 Heading</Heading>);
      expect(screen.getByText('H3 Heading').tagName).toBe('H3');
    });

    it('renders h2 for 2xl size', () => {
      render(<Heading size="2xl">H2 Heading</Heading>);
      expect(screen.getByText('H2 Heading').tagName).toBe('H2');
    });

    it('renders h1 for 3xl size', () => {
      render(<Heading size="3xl">H1 Heading</Heading>);
      expect(screen.getByText('H1 Heading').tagName).toBe('H1');
    });

    it('applies text-lg class for lg size', () => {
      render(<Heading size="lg">Title</Heading>);
      expect(screen.getByRole('heading')).toHaveClass('text-lg');
    });

    it('applies text-base class for md size', () => {
      render(<Heading size="md">Title</Heading>);
      expect(screen.getByRole('heading')).toHaveClass('text-base');
    });

    it('applies text-sm class for sm size', () => {
      render(<Heading size="sm">Title</Heading>);
      expect(screen.getByRole('heading')).toHaveClass('text-sm');
    });

    it('applies text-xl class for xl size', () => {
      render(<Heading size="xl">Title</Heading>);
      expect(screen.getByRole('heading')).toHaveClass('text-xl');
    });

    it('applies text-2xl and font-bold for 2xl size', () => {
      render(<Heading size="2xl">Title</Heading>);
      const heading = screen.getByRole('heading');
      expect(heading).toHaveClass('text-2xl');
      expect(heading).toHaveClass('font-bold');
    });

    it('applies text-3xl and font-bold for 3xl size', () => {
      render(<Heading size="3xl">Title</Heading>);
      const heading = screen.getByRole('heading');
      expect(heading).toHaveClass('text-3xl');
      expect(heading).toHaveClass('font-bold');
    });
  });

  describe('`as` prop override', () => {
    it('can override element with `as` prop', () => {
      render(
        <Heading as="h1" size="lg">
          Override H1
        </Heading>,
      );
      expect(screen.getByText('Override H1').tagName).toBe('H1');
    });

    it('can render as div', () => {
      render(<Heading as="div">Div Heading</Heading>);
      expect(screen.getByText('Div Heading').tagName).toBe('DIV');
    });

    it('can render as span', () => {
      render(<Heading as="span">Span Heading</Heading>);
      expect(screen.getByText('Span Heading').tagName).toBe('SPAN');
    });
  });

  describe('HTML attributes', () => {
    it('forwards id attribute', () => {
      render(<Heading id="page-title">Title</Heading>);
      expect(screen.getByRole('heading')).toHaveAttribute('id', 'page-title');
    });

    it('forwards data attributes', () => {
      render(<Heading data-testid="custom-heading">Title</Heading>);
      expect(screen.getByTestId('custom-heading')).toBeInTheDocument();
    });

    it('forwards aria attributes', () => {
      render(<Heading aria-label="Main page title">Title</Heading>);
      expect(screen.getByRole('heading')).toHaveAttribute(
        'aria-label',
        'Main page title',
      );
    });
  });

  describe('accessibility', () => {
    it('is a heading element', () => {
      render(<Heading>Accessible Heading</Heading>);
      expect(screen.getByRole('heading')).toBeInTheDocument();
    });

    it('level 1 heading is accessible', () => {
      render(<Heading size="3xl">H1 Heading</Heading>);
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    it('level 2 heading is accessible', () => {
      render(<Heading size="2xl">H2 Heading</Heading>);
      expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    });

    it('level 3 heading is accessible', () => {
      render(<Heading size="lg">H3 Heading</Heading>);
      expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument();
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref to heading element', () => {
      const ref = vi.fn();
      render(<Heading ref={ref}>Title</Heading>);
      expect(ref).toHaveBeenCalled();
      expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLHeadingElement);
    });
  });

  describe('styling', () => {
    it('has text-foreground by default', () => {
      render(<Heading>Title</Heading>);
      expect(screen.getByRole('heading')).toHaveClass('text-foreground');
    });

    it('preserves styles with custom className', () => {
      render(<Heading className="my-class">Title</Heading>);
      const heading = screen.getByRole('heading');
      expect(heading).toHaveClass('my-class');
      expect(heading).toHaveClass('font-semibold');
    });
  });
});
