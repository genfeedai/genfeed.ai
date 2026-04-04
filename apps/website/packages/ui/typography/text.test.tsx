import { render, screen } from '@testing-library/react';
import { Text } from '@ui/typography/text';
import { describe, expect, it, vi } from 'vitest';

describe('Text', () => {
  it('renders without crashing', () => {
    render(<Text>Content</Text>);
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders as span by default', () => {
    render(<Text>Content</Text>);
    expect(screen.getByText('Content').tagName).toBe('SPAN');
  });

  it('can render as different element via `as` prop', () => {
    render(<Text as="p">Paragraph</Text>);
    expect(screen.getByText('Paragraph').tagName).toBe('P');
  });

  it('can render as div', () => {
    render(<Text as="div">Div text</Text>);
    expect(screen.getByText('Div text').tagName).toBe('DIV');
  });

  it('can render as article', () => {
    render(<Text as="article">Article</Text>);
    expect(screen.getByText('Article').tagName).toBe('ARTICLE');
  });

  it('applies custom className', () => {
    render(<Text className="custom-text">Text</Text>);
    expect(screen.getByText('Text')).toHaveClass('custom-text');
  });

  describe('size variants', () => {
    it('renders base size by default', () => {
      render(<Text>Base text</Text>);
      expect(screen.getByText('Base text')).toHaveClass('text-base');
    });

    it('renders xs size', () => {
      render(<Text size="xs">XS text</Text>);
      expect(screen.getByText('XS text')).toHaveClass('text-xs');
    });

    it('renders 2xs size', () => {
      render(<Text size="2xs">2XS text</Text>);
      expect(screen.getByText('2XS text')).toHaveClass('text-[10px]');
    });

    it('renders sm size', () => {
      render(<Text size="sm">Small text</Text>);
      expect(screen.getByText('Small text')).toHaveClass('text-sm');
    });

    it('renders lg size', () => {
      render(<Text size="lg">Large text</Text>);
      expect(screen.getByText('Large text')).toHaveClass('text-lg');
    });

    it('renders xl size', () => {
      render(<Text size="xl">XL text</Text>);
      expect(screen.getByText('XL text')).toHaveClass('text-xl');
    });
  });

  describe('color variants', () => {
    it('renders default color', () => {
      render(<Text color="default">Default</Text>);
      expect(screen.getByText('Default')).toHaveClass('text-foreground');
    });

    it('renders muted color', () => {
      render(<Text color="muted">Muted</Text>);
      expect(screen.getByText('Muted')).toHaveClass('text-muted-foreground');
    });

    it('renders primary color', () => {
      render(<Text color="primary">Primary</Text>);
      expect(screen.getByText('Primary')).toHaveClass('text-primary');
    });

    it('renders destructive color', () => {
      render(<Text color="destructive">Error</Text>);
      expect(screen.getByText('Error')).toHaveClass('text-destructive');
    });

    it('renders subtle-50 color', () => {
      render(<Text color="subtle-50">Subtle</Text>);
      expect(screen.getByText('Subtle')).toHaveClass('text-foreground/50');
    });

    it('renders subtle-60 color', () => {
      render(<Text color="subtle-60">Subtle60</Text>);
      expect(screen.getByText('Subtle60')).toHaveClass('text-foreground/60');
    });

    it('renders subtle-70 color', () => {
      render(<Text color="subtle-70">Subtle70</Text>);
      expect(screen.getByText('Subtle70')).toHaveClass('text-foreground/70');
    });
  });

  describe('weight variants', () => {
    it('renders normal weight by default', () => {
      render(<Text>Normal</Text>);
      expect(screen.getByText('Normal')).toHaveClass('font-normal');
    });

    it('renders medium weight', () => {
      render(<Text weight="medium">Medium</Text>);
      expect(screen.getByText('Medium')).toHaveClass('font-medium');
    });

    it('renders semibold weight', () => {
      render(<Text weight="semibold">Semibold</Text>);
      expect(screen.getByText('Semibold')).toHaveClass('font-semibold');
    });

    it('renders bold weight', () => {
      render(<Text weight="bold">Bold</Text>);
      expect(screen.getByText('Bold')).toHaveClass('font-bold');
    });

    it('renders black weight', () => {
      render(<Text weight="black">Black</Text>);
      expect(screen.getByText('Black')).toHaveClass('font-black');
    });
  });

  describe('combined props', () => {
    it('combines size and color', () => {
      render(
        <Text size="sm" color="muted">
          Combined
        </Text>,
      );
      const text = screen.getByText('Combined');
      expect(text).toHaveClass('text-sm');
      expect(text).toHaveClass('text-muted-foreground');
    });

    it('combines all variants', () => {
      render(
        <Text size="lg" color="primary" weight="bold">
          All variants
        </Text>,
      );
      const text = screen.getByText('All variants');
      expect(text).toHaveClass('text-lg');
      expect(text).toHaveClass('text-primary');
      expect(text).toHaveClass('font-bold');
    });
  });

  describe('HTML attributes', () => {
    it('forwards id attribute', () => {
      render(<Text id="my-text">Text</Text>);
      expect(screen.getByText('Text')).toHaveAttribute('id', 'my-text');
    });

    it('forwards data attributes', () => {
      render(<Text data-testid="custom-text">Text</Text>);
      expect(screen.getByTestId('custom-text')).toBeInTheDocument();
    });

    it('forwards aria attributes', () => {
      render(<Text aria-label="Descriptive text">Text</Text>);
      expect(screen.getByText('Text')).toHaveAttribute(
        'aria-label',
        'Descriptive text',
      );
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref to element', () => {
      const ref = vi.fn();
      render(<Text ref={ref}>Text</Text>);
      expect(ref).toHaveBeenCalled();
    });
  });
});
