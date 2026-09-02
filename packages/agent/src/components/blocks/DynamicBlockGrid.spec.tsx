import DynamicBlockGrid from '@genfeedai/agent/components/blocks/DynamicBlockGrid';
import type { AgentUIBlock } from '@genfeedai/contracts/interfaces';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/agent/components/blocks/DynamicChart', () => ({
  default: ({ block }: { block: { id: string } }) => (
    <div data-testid={`chart-${block.id}`} />
  ),
}));

function block<T extends AgentUIBlock>(value: T): AgentUIBlock {
  return value as AgentUIBlock;
}

function renderBlocks(blocks: AgentUIBlock[]) {
  return render(<DynamicBlockGrid blocks={blocks} />);
}

describe('DynamicBlockGrid', () => {
  beforeEach(() => {
    // Drive the metric count-up animation deterministically.
    vi.stubGlobal(
      'requestAnimationFrame',
      (callback: FrameRequestCallback): number => {
        callback(performance.now() + 10_000);
        return 1;
      },
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders an empty state when there are no blocks', () => {
    renderBlocks([]);

    expect(screen.getByText('No blocks to display')).toBeInTheDocument();
  });

  it('renders a block title above every non-metric block', () => {
    renderBlocks([
      block({
        id: 'b-1',
        text: 'Body copy',
        title: 'Overview',
        type: 'text_paragraph',
      } as AgentUIBlock),
    ]);

    expect(screen.getByRole('heading', { name: 'Overview' })).toBeVisible();
    expect(screen.getByText('Body copy')).toBeInTheDocument();
  });

  it('maps block width onto a column span', () => {
    const { container } = renderBlocks([
      block({ id: 'b-1', text: 'a', type: 'text_paragraph' } as AgentUIBlock),
      block({
        id: 'b-2',
        text: 'b',
        type: 'text_paragraph',
        width: 'half',
      } as AgentUIBlock),
      block({
        id: 'b-3',
        text: 'c',
        type: 'text_paragraph',
        width: 'third',
      } as AgentUIBlock),
    ]);

    const cells = container.querySelectorAll('.grid > div');

    expect(cells[0]?.className).toContain('col-span-12');
    expect(cells[1]?.className).toContain('col-span-6');
    expect(cells[2]?.className).toContain('col-span-4');
  });

  it('applies the hydration stagger as an animation delay', () => {
    const { container } = renderBlocks([
      block({
        hydration: { staggerMs: 120 },
        id: 'b-1',
        text: 'a',
        type: 'text_paragraph',
      } as unknown as AgentUIBlock),
    ]);

    expect(
      (container.querySelector('.grid > div') as HTMLElement).style
        .animationDelay,
    ).toBe('120ms');
  });

  it('renders an unknown block type as a placeholder', () => {
    renderBlocks([block({ id: 'b-1', type: 'not_a_block' } as AgentUIBlock)]);

    expect(screen.getByText('Unknown block type')).toBeInTheDocument();
  });

  describe('metric cards', () => {
    it('animates a numeric value to its final figure', () => {
      renderBlocks([
        block({
          id: 'm-1',
          title: 'Followers',
          type: 'metric_card',
          value: 1234,
        } as AgentUIBlock),
      ]);

      expect(screen.getByText('1234')).toBeInTheDocument();
    });

    it('preserves a suffix on abbreviated values', () => {
      renderBlocks([
        block({
          id: 'm-1',
          title: 'Reach',
          type: 'metric_card',
          value: '12.5K',
        } as AgentUIBlock),
      ]);

      expect(screen.getByText('12.5K')).toBeInTheDocument();
    });

    it('renders non-numeric values verbatim', () => {
      renderBlocks([
        block({
          id: 'm-1',
          title: 'Status',
          type: 'metric_card',
          value: 'Healthy',
        } as AgentUIBlock),
      ]);

      expect(screen.getByText('Healthy')).toBeInTheDocument();
    });

    it('signs the trend downward for a falling metric', () => {
      renderBlocks([
        block({
          id: 'm-1',
          title: 'Views',
          trend: { direction: 'down', percentage: 12 },
          type: 'metric_card',
          value: 10,
        } as AgentUIBlock),
      ]);

      expect(screen.getByText(/12/)).toBeInTheDocument();
    });

    it('lays out a kpi grid over the requested column count', () => {
      const { container } = renderBlocks([
        block({
          cards: [
            { id: 'c-1', title: 'A', type: 'metric_card', value: 1 },
            { id: 'c-2', title: 'B', type: 'metric_card', value: 2 },
          ],
          columns: 2,
          id: 'k-1',
          type: 'kpi_grid',
        } as unknown as AgentUIBlock),
      ]);

      const grid = container.querySelector(
        '[style*="grid-template-columns"]',
      ) as HTMLElement;

      expect(grid.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
    });
  });

  describe('top posts', () => {
    const posts = [
      {
        engagement: 250,
        id: 'p-1',
        platform: 'instagram',
        thumbnail: 'https://cdn.test/1.jpg',
        title: 'First post',
        views: 1000,
      },
      { id: 'p-2' },
    ];

    it('renders list layout with metadata and thumbnails', () => {
      renderBlocks([
        block({
          id: 't-1',
          posts,
          type: 'top_posts',
        } as unknown as AgentUIBlock),
      ]);

      expect(screen.getByText('First post')).toBeInTheDocument();
      expect(screen.getByText('instagram')).toBeInTheDocument();
      expect(screen.getByText('1,000 views')).toBeInTheDocument();
      expect(screen.getByText('250 eng.')).toBeInTheDocument();
      expect(screen.getByAltText('First post')).toHaveAttribute(
        'src',
        'https://cdn.test/1.jpg',
      );
    });

    it('renders grid layout', () => {
      const { container } = renderBlocks([
        block({
          id: 't-1',
          layout: 'grid',
          posts,
          type: 'top_posts',
        } as unknown as AgentUIBlock),
      ]);

      expect(container.querySelector('.grid-cols-2')).toBeTruthy();
    });

    it('renders skeletons while hydrating', () => {
      renderBlocks([
        block({
          hydration: { status: 'loading' },
          id: 't-1',
          posts,
          type: 'top_posts',
        } as unknown as AgentUIBlock),
      ]);

      expect(screen.queryByText('First post')).not.toBeInTheDocument();
    });
  });

  describe('text-ish blocks', () => {
    it('renders each alert severity', () => {
      renderBlocks([
        block({
          id: 'a-1',
          message: 'Broke',
          severity: 'error',
          type: 'alert',
        } as AgentUIBlock),
        block({
          id: 'a-2',
          message: 'Careful',
          severity: 'warning',
          type: 'alert',
        } as AgentUIBlock),
        block({
          id: 'a-3',
          message: 'Nice',
          severity: 'success',
          type: 'alert',
        } as AgentUIBlock),
        block({ id: 'a-4', message: 'FYI', type: 'alert' } as AgentUIBlock),
      ]);

      expect(screen.getByText('Broke')).toBeInTheDocument();
      expect(screen.getByText('Careful')).toBeInTheDocument();
      expect(screen.getByText('Nice')).toBeInTheDocument();
      expect(screen.getByText('FYI')).toBeInTheDocument();
    });

    it('renders each section header level', () => {
      renderBlocks([
        block({
          id: 'h-1',
          level: 1,
          text: 'One',
          type: 'section_header',
        } as AgentUIBlock),
        block({
          id: 'h-2',
          text: 'Two',
          type: 'section_header',
        } as AgentUIBlock),
        block({
          id: 'h-3',
          level: 3,
          text: 'Three',
          type: 'section_header',
        } as AgentUIBlock),
      ]);

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'One',
      );
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
        'Two',
      );
      expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
        'Three',
      );
    });

    it('renders ordered and unordered bullet lists', () => {
      const { container } = renderBlocks([
        block({
          id: 'l-1',
          items: ['alpha', 'beta'],
          type: 'bullet_list',
        } as AgentUIBlock),
        block({
          id: 'l-2',
          items: ['one'],
          ordered: true,
          type: 'bullet_list',
        } as AgentUIBlock),
      ]);

      expect(container.querySelector('ul.list-disc')).toBeTruthy();
      expect(container.querySelector('ol.list-decimal')).toBeTruthy();
      expect(screen.getByText('alpha')).toBeInTheDocument();
    });

    it('renders every callout tone and defaults to info', () => {
      renderBlocks([
        block({
          id: 'c-1',
          message: 'Info',
          type: 'callout',
        } as AgentUIBlock),
        block({
          id: 'c-2',
          message: 'Warn',
          tone: 'warning',
          type: 'callout',
        } as AgentUIBlock),
        block({
          id: 'c-3',
          message: 'Err',
          tone: 'error',
          type: 'callout',
        } as AgentUIBlock),
        block({
          id: 'c-4',
          message: 'Yay',
          tone: 'success',
          type: 'callout',
        } as AgentUIBlock),
      ]);

      expect(screen.getByText('Info')).toHaveClass('text-info');
      expect(screen.getByText('Warn')).toHaveClass('text-warning');
      expect(screen.getByText('Err')).toHaveClass('text-destructive');
      expect(screen.getByText('Yay')).toHaveClass('text-success');
    });

    it('renders markdown content', () => {
      renderBlocks([
        block({
          content: 'hello **world**',
          id: 'md-1',
          type: 'markdown',
        } as AgentUIBlock),
      ]);

      expect(screen.getByText(/hello/)).toBeInTheDocument();
    });
  });

  it('renders an image grid with captions', () => {
    renderBlocks([
      block({
        columns: 2,
        id: 'ig-1',
        images: [
          {
            alt: 'A photo',
            caption: 'Shot one',
            url: 'https://cdn.test/a.jpg',
          },
          { url: 'https://cdn.test/b.jpg' },
        ],
        type: 'image_grid',
      } as unknown as AgentUIBlock),
    ]);

    expect(screen.getByAltText('A photo')).toBeInTheDocument();
    expect(screen.getByText('Shot one')).toBeInTheDocument();
  });

  it('renders an empty-state block with its optional icon and cta', () => {
    renderBlocks([
      block({
        ctaLabel: 'Create one',
        icon: '📭',
        id: 'e-1',
        message: 'Nothing here yet',
        type: 'empty_state',
      } as AgentUIBlock),
    ]);

    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
    expect(screen.getByText('📭')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create one' }),
    ).toBeInTheDocument();
  });

  it('delegates chart and table blocks to their own renderers', () => {
    renderBlocks([
      block({
        id: 'ch-1',
        series: [],
        type: 'chart',
      } as unknown as AgentUIBlock),
      block({
        columns: [{ key: 'name', label: 'Name' }],
        id: 'tb-1',
        rows: [{ name: 'Alpha' }],
        type: 'table',
      } as unknown as AgentUIBlock),
    ]);

    expect(screen.getByTestId('chart-ch-1')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });

  it('renders composite blocks by nesting a grid', () => {
    const { container } = renderBlocks([
      block({
        blocks: [{ id: 'inner-1', text: 'Nested', type: 'text_paragraph' }],
        id: 'co-1',
        layout: 'row',
        type: 'composite',
      } as unknown as AgentUIBlock),
    ]);

    expect(screen.getByText('Nested')).toBeInTheDocument();
    expect(container.querySelector('.flex.gap-4')).toBeTruthy();
  });

  it('stacks composite blocks when the layout is not a row', () => {
    const { container } = renderBlocks([
      block({
        blocks: [{ id: 'inner-1', text: 'Nested', type: 'text_paragraph' }],
        id: 'co-1',
        layout: 'column',
        type: 'composite',
      } as unknown as AgentUIBlock),
    ]);

    expect(container.querySelector('.flex.flex-col.gap-4')).toBeTruthy();
  });

  it('cancels the metric animation frame on unmount', () => {
    const cancel = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancel);

    const { unmount } = renderBlocks([
      block({
        id: 'm-1',
        title: 'Followers',
        type: 'metric_card',
        value: 42,
      } as AgentUIBlock),
    ]);

    act(() => {
      unmount();
    });

    expect(cancel).toHaveBeenCalled();
  });
});
