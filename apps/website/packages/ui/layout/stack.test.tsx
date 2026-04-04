import { render, screen } from '@testing-library/react';
import { HStack, Stack, VStack } from '@ui/layout/stack';
import { describe, expect, it, vi } from 'vitest';

describe('Stack', () => {
  it('renders without crashing', () => {
    render(<Stack data-testid="stack">Content</Stack>);
    expect(screen.getByTestId('stack')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(<Stack>Stack content</Stack>);
    expect(screen.getByText('Stack content')).toBeInTheDocument();
  });

  it('renders as div element', () => {
    render(<Stack data-testid="stack">Content</Stack>);
    expect(screen.getByTestId('stack').tagName).toBe('DIV');
  });

  it('applies custom className', () => {
    render(
      <Stack className="custom-stack" data-testid="stack">
        Content
      </Stack>,
    );
    expect(screen.getByTestId('stack')).toHaveClass('custom-stack');
  });

  it('has flex class', () => {
    render(<Stack data-testid="stack">Content</Stack>);
    expect(screen.getByTestId('stack')).toHaveClass('flex');
  });

  describe('direction variants', () => {
    it('renders column direction by default', () => {
      render(<Stack data-testid="stack">Content</Stack>);
      expect(screen.getByTestId('stack')).toHaveClass('flex-col');
    });

    it('renders row direction', () => {
      render(
        <Stack direction="row" data-testid="stack">
          Content
        </Stack>,
      );
      expect(screen.getByTestId('stack')).toHaveClass('flex-row');
    });

    it('renders column-reverse direction', () => {
      render(
        <Stack direction="column-reverse" data-testid="stack">
          Content
        </Stack>,
      );
      expect(screen.getByTestId('stack')).toHaveClass('flex-col-reverse');
    });

    it('renders row-reverse direction', () => {
      render(
        <Stack direction="row-reverse" data-testid="stack">
          Content
        </Stack>,
      );
      expect(screen.getByTestId('stack')).toHaveClass('flex-row-reverse');
    });
  });

  describe('gap variants', () => {
    it('renders gap-4 by default', () => {
      render(<Stack data-testid="stack">Content</Stack>);
      expect(screen.getByTestId('stack')).toHaveClass('gap-4');
    });

    it('renders gap-0', () => {
      render(
        <Stack gap={0} data-testid="stack">
          Content
        </Stack>,
      );
      expect(screen.getByTestId('stack')).toHaveClass('gap-0');
    });

    it('renders gap-2', () => {
      render(
        <Stack gap={2} data-testid="stack">
          Content
        </Stack>,
      );
      expect(screen.getByTestId('stack')).toHaveClass('gap-2');
    });

    it('renders gap-6', () => {
      render(
        <Stack gap={6} data-testid="stack">
          Content
        </Stack>,
      );
      expect(screen.getByTestId('stack')).toHaveClass('gap-6');
    });

    it('renders gap-8', () => {
      render(
        <Stack gap={8} data-testid="stack">
          Content
        </Stack>,
      );
      expect(screen.getByTestId('stack')).toHaveClass('gap-8');
    });
  });

  describe('align variants', () => {
    it('renders items-stretch by default', () => {
      render(<Stack data-testid="stack">Content</Stack>);
      expect(screen.getByTestId('stack')).toHaveClass('items-stretch');
    });

    it('renders items-center', () => {
      render(
        <Stack align="center" data-testid="stack">
          Content
        </Stack>,
      );
      expect(screen.getByTestId('stack')).toHaveClass('items-center');
    });

    it('renders items-start', () => {
      render(
        <Stack align="start" data-testid="stack">
          Content
        </Stack>,
      );
      expect(screen.getByTestId('stack')).toHaveClass('items-start');
    });

    it('renders items-end', () => {
      render(
        <Stack align="end" data-testid="stack">
          Content
        </Stack>,
      );
      expect(screen.getByTestId('stack')).toHaveClass('items-end');
    });

    it('renders items-baseline', () => {
      render(
        <Stack align="baseline" data-testid="stack">
          Content
        </Stack>,
      );
      expect(screen.getByTestId('stack')).toHaveClass('items-baseline');
    });
  });

  describe('justify variants', () => {
    it('renders justify-start by default', () => {
      render(<Stack data-testid="stack">Content</Stack>);
      expect(screen.getByTestId('stack')).toHaveClass('justify-start');
    });

    it('renders justify-center', () => {
      render(
        <Stack justify="center" data-testid="stack">
          Content
        </Stack>,
      );
      expect(screen.getByTestId('stack')).toHaveClass('justify-center');
    });

    it('renders justify-end', () => {
      render(
        <Stack justify="end" data-testid="stack">
          Content
        </Stack>,
      );
      expect(screen.getByTestId('stack')).toHaveClass('justify-end');
    });

    it('renders justify-between', () => {
      render(
        <Stack justify="between" data-testid="stack">
          Content
        </Stack>,
      );
      expect(screen.getByTestId('stack')).toHaveClass('justify-between');
    });
  });

  describe('wrap variants', () => {
    it('renders flex-nowrap by default', () => {
      render(<Stack data-testid="stack">Content</Stack>);
      expect(screen.getByTestId('stack')).toHaveClass('flex-nowrap');
    });

    it('renders flex-wrap when wrap=true', () => {
      render(
        <Stack wrap={true} data-testid="stack">
          Content
        </Stack>,
      );
      expect(screen.getByTestId('stack')).toHaveClass('flex-wrap');
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref to div element', () => {
      const ref = vi.fn();
      render(<Stack ref={ref}>Content</Stack>);
      expect(ref).toHaveBeenCalled();
      expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe('multiple children', () => {
    it('renders multiple children', () => {
      render(
        <Stack>
          <span>Child 1</span>
          <span>Child 2</span>
          <span>Child 3</span>
        </Stack>,
      );
      expect(screen.getByText('Child 1')).toBeInTheDocument();
      expect(screen.getByText('Child 2')).toBeInTheDocument();
      expect(screen.getByText('Child 3')).toBeInTheDocument();
    });
  });
});

describe('VStack', () => {
  it('renders as vertical stack', () => {
    render(<VStack data-testid="vstack">Content</VStack>);
    const vstack = screen.getByTestId('vstack');
    expect(vstack).toHaveClass('flex');
    expect(vstack).toHaveClass('flex-col');
  });

  it('renders children', () => {
    render(
      <VStack>
        <span>Item 1</span>
        <span>Item 2</span>
      </VStack>,
    );
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <VStack className="my-vstack" data-testid="vstack">
        Content
      </VStack>,
    );
    expect(screen.getByTestId('vstack')).toHaveClass('my-vstack');
  });

  it('supports gap prop', () => {
    render(
      <VStack gap={6} data-testid="vstack">
        Content
      </VStack>,
    );
    expect(screen.getByTestId('vstack')).toHaveClass('gap-6');
  });

  it('supports align prop', () => {
    render(
      <VStack align="center" data-testid="vstack">
        Content
      </VStack>,
    );
    expect(screen.getByTestId('vstack')).toHaveClass('items-center');
  });
});

describe('HStack', () => {
  it('renders as horizontal stack', () => {
    render(<HStack data-testid="hstack">Content</HStack>);
    const hstack = screen.getByTestId('hstack');
    expect(hstack).toHaveClass('flex');
    expect(hstack).toHaveClass('flex-row');
  });

  it('has items-center by default', () => {
    render(<HStack data-testid="hstack">Content</HStack>);
    expect(screen.getByTestId('hstack')).toHaveClass('items-center');
  });

  it('renders children', () => {
    render(
      <HStack>
        <span>Item 1</span>
        <span>Item 2</span>
      </HStack>,
    );
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <HStack className="my-hstack" data-testid="hstack">
        Content
      </HStack>,
    );
    expect(screen.getByTestId('hstack')).toHaveClass('my-hstack');
  });

  it('supports gap prop', () => {
    render(
      <HStack gap={4} data-testid="hstack">
        Content
      </HStack>,
    );
    expect(screen.getByTestId('hstack')).toHaveClass('gap-4');
  });

  it('supports justify prop', () => {
    render(
      <HStack justify="between" data-testid="hstack">
        Content
      </HStack>,
    );
    expect(screen.getByTestId('hstack')).toHaveClass('justify-between');
  });

  it('can override align', () => {
    render(
      <HStack align="start" data-testid="hstack">
        Content
      </HStack>,
    );
    expect(screen.getByTestId('hstack')).toHaveClass('items-start');
  });
});
