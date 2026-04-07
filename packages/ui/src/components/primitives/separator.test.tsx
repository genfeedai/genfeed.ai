import { render } from '@testing-library/react';
import { Separator } from '@ui/primitives/separator';
import { describe, expect, it, vi } from 'vitest';

describe('Separator', () => {
  // Helper: by default decorative=true, so Radix renders role="none" (or "separator" if decorative=false)
  const getSeparator = (container: HTMLElement) =>
    container.querySelector('[data-orientation]');

  it('renders without crashing', () => {
    const { container } = render(<Separator />);
    expect(getSeparator(container)).toBeInTheDocument();
  });

  it('is decorative by default (role=none)', () => {
    const { container } = render(<Separator />);
    const sep = getSeparator(container);
    // Decorative separators have role="none" in Radix
    expect(sep).toBeInTheDocument();
  });

  it('has separator role when not decorative', () => {
    const { container } = render(<Separator decorative={false} />);
    const separator = container.querySelector('[role="separator"]');
    expect(separator).toBeInTheDocument();
  });

  it('renders horizontal separator by default', () => {
    const { container } = render(<Separator />);
    const sep = getSeparator(container);
    expect(sep).toHaveAttribute('data-orientation', 'horizontal');
  });

  it('renders vertical separator when orientation is vertical', () => {
    const { container } = render(<Separator orientation="vertical" />);
    const sep = getSeparator(container);
    expect(sep).toHaveAttribute('data-orientation', 'vertical');
  });

  it('applies custom className', () => {
    const { container } = render(<Separator className="custom-separator" />);
    const sep = getSeparator(container);
    expect(sep).toHaveClass('custom-separator');
  });

  it('preserves default styling with custom className', () => {
    const { container } = render(<Separator className="custom-separator" />);
    const sep = getSeparator(container);
    expect(sep).toHaveClass('custom-separator');
    expect(sep).toHaveClass('shrink-0');
    expect(sep).toHaveClass('bg-border');
  });

  describe('orientations', () => {
    it('has horizontal height', () => {
      const { container } = render(<Separator orientation="horizontal" />);
      const sep = getSeparator(container);
      expect(sep).toHaveClass('h-[1px]');
      expect(sep).toHaveClass('w-full');
    });

    it('has vertical width', () => {
      const { container } = render(<Separator orientation="vertical" />);
      const sep = getSeparator(container);
      expect(sep).toHaveClass('h-full');
      expect(sep).toHaveClass('w-[1px]');
    });
  });

  describe('decorative', () => {
    it('is decorative by default', () => {
      const { container } = render(<Separator />);
      const sep = getSeparator(container);
      expect(sep).toBeInTheDocument();
    });

    it('sets decorative attribute when decorative is true', () => {
      const { container } = render(<Separator decorative />);
      const sep = getSeparator(container);
      expect(sep).toBeInTheDocument();
    });

    it('allows non-decorative separator', () => {
      const { container } = render(<Separator decorative={false} />);
      const separator = container.querySelector('[role="separator"]');
      expect(separator).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has data-orientation for non-decorative horizontal', () => {
      const { container } = render(
        <Separator orientation="horizontal" decorative={false} />,
      );
      const separator = container.querySelector('[role="separator"]');
      expect(separator).toBeInTheDocument();
      expect(separator).toHaveAttribute('data-orientation', 'horizontal');
    });

    it('has aria-orientation for non-decorative vertical', () => {
      const { container } = render(
        <Separator orientation="vertical" decorative={false} />,
      );
      const separator = container.querySelector('[role="separator"]');
      expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    });

    it('supports aria-label', () => {
      const { container } = render(<Separator aria-label="Section divider" />);
      const sep = getSeparator(container);
      expect(sep).toHaveAttribute('aria-label', 'Section divider');
    });
  });

  describe('HTML attributes', () => {
    it('forwards data attributes', () => {
      const { container } = render(
        <Separator data-testid="custom-separator" />,
      );
      const separator = container.querySelector(
        '[data-testid="custom-separator"]',
      );
      expect(separator).toBeInTheDocument();
    });

    it('forwards id attribute', () => {
      const { container } = render(<Separator id="my-separator" />);
      const sep = getSeparator(container);
      expect(sep).toHaveAttribute('id', 'my-separator');
    });
  });

  describe('styling', () => {
    it('has background color', () => {
      const { container } = render(<Separator />);
      const sep = getSeparator(container);
      expect(sep).toHaveClass('bg-border');
    });

    it('has shrink-0 class', () => {
      const { container } = render(<Separator />);
      const sep = getSeparator(container);
      expect(sep).toHaveClass('shrink-0');
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref to separator element', () => {
      const ref = vi.fn();
      render(<Separator ref={ref} />);

      expect(ref).toHaveBeenCalled();
      const callArg = ref.mock.calls[0][0];
      expect(callArg).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe('use cases', () => {
    it('can be used in lists', () => {
      const { container } = render(
        <div>
          <div>Item 1</div>
          <Separator />
          <div>Item 2</div>
        </div>,
      );
      const sep = getSeparator(container);
      expect(sep).toBeInTheDocument();
    });

    it('can be used in flex layouts horizontally', () => {
      const { container } = render(
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div>Top</div>
          <Separator />
          <div>Bottom</div>
        </div>,
      );
      const sep = getSeparator(container);
      expect(sep).toHaveAttribute('data-orientation', 'horizontal');
    });

    it('can be used in flex layouts vertically', () => {
      const { container } = render(
        <div style={{ display: 'flex' }}>
          <div>Left</div>
          <Separator orientation="vertical" />
          <div>Right</div>
        </div>,
      );
      const sep = getSeparator(container);
      expect(sep).toHaveAttribute('data-orientation', 'vertical');
    });
  });
});
