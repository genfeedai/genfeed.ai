'use client';

import CompositeLayout from '@genfeedai/agent/components/blocks/CompositeLayout';
import DynamicChart from '@genfeedai/agent/components/blocks/DynamicChart';
import DynamicTable from '@genfeedai/agent/components/blocks/DynamicTable';
import { SafeMarkdown } from '@genfeedai/agent/components/SafeMarkdown';
import type {
  AgentUIBlock,
  AgentUIBlockWidth,
  AlertBlock,
  BulletListBlock,
  CalloutBlock,
  ChartBlock,
  CompositeBlock,
  EmptyStateBlock,
  ImageGridBlock,
  KPIGridBlock,
  MarkdownBlock,
  MetricCardBlock,
  SectionHeaderBlock,
  TableBlock,
  TextParagraphBlock,
  TopPostsBlock,
} from '@genfeedai/interfaces';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';

interface DynamicBlockGridProps {
  blocks: AgentUIBlock[];
}

type BlockHydration = {
  status?: 'idle' | 'loading' | 'ready';
  staggerMs?: number;
};

type HydratableBlock<T extends AgentUIBlock = AgentUIBlock> = T & {
  hydration?: BlockHydration;
};

function getColSpan(width?: AgentUIBlockWidth): string {
  switch (width) {
    case 'half':
      return 'col-span-6';
    case 'third':
      return 'col-span-4';
    default:
      return 'col-span-12';
  }
}

function getTrendArrow(direction: 'up' | 'down' | 'flat'): string {
  switch (direction) {
    case 'up':
      return '\u2191';
    case 'down':
      return '\u2193';
    case 'flat':
      return '\u2192';
  }
}

function getTrendColor(direction: 'up' | 'down' | 'flat'): string {
  switch (direction) {
    case 'up':
      return 'text-green-500';
    case 'down':
      return 'text-red-500';
    case 'flat':
      return 'text-muted-foreground';
  }
}

function getAlertStyles(severity?: AlertBlock['severity']): {
  border: string;
  bg: string;
  text: string;
  icon: string;
} {
  switch (severity) {
    case 'error':
      return {
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        icon: '\u2716',
        text: 'text-red-400',
      };
    case 'warning':
      return {
        bg: 'bg-yellow-500/10',
        border: 'border-yellow-500/30',
        icon: '\u26A0',
        text: 'text-yellow-400',
      };
    case 'success':
      return {
        bg: 'bg-green-500/10',
        border: 'border-green-500/30',
        icon: '\u2714',
        text: 'text-green-400',
      };
    default:
      return {
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/30',
        icon: '\u2139',
        text: 'text-blue-400',
      };
  }
}

function formatAnimatedValue(value: number, template: string): string {
  const suffixMatch = template.match(/([KMBT%]+)$/i);
  const suffix = suffixMatch?.[1] ?? '';
  const hasDecimals = /\.\d/.test(template);
  const precision = hasDecimals ? 1 : 0;
  return `${value.toFixed(precision)}${suffix}`;
}

function parseAnimatedValue(value: MetricCardBlock['value']): {
  canAnimate: boolean;
  numericValue: number;
  template: string;
} {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { canAnimate: true, numericValue: value, template: String(value) };
  }

  if (typeof value !== 'string') {
    return { canAnimate: false, numericValue: 0, template: '' };
  }

  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)([KMBT%])?$/i);
  if (!match) {
    return { canAnimate: false, numericValue: 0, template: value };
  }

  return {
    canAnimate: true,
    numericValue: Number(match[1]),
    template: value,
  };
}

function MetricValue({
  value,
}: {
  value: MetricCardBlock['value'];
}): ReactElement {
  const { canAnimate, numericValue, template } = useMemo(
    () => parseAnimatedValue(value),
    [value],
  );
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    if (!canAnimate) {
      setDisplayValue(value);
      return;
    }

    const durationMs = 700;
    const startedAt = performance.now();
    let frameId = 0;

    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / durationMs, 1);
      const eased = 1 - (1 - progress) * (1 - progress);
      const nextValue = numericValue * eased;
      setDisplayValue(formatAnimatedValue(nextValue, template));

      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    setDisplayValue(formatAnimatedValue(0, template));
    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [canAnimate, numericValue, template, value]);

  return <>{displayValue}</>;
}

function MetricCard({ block }: { block: MetricCardBlock }): ReactElement {
  const hydratableBlock = block as HydratableBlock<MetricCardBlock>;
  const isLoading = hydratableBlock.hydration?.status === 'loading';
  return (
    <div className="rounded-lg border border-border bg-card p-4 transition-all duration-500">
      {block.title && (
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          {block.title}
        </p>
      )}
      <div className="flex items-baseline gap-2">
        {isLoading ? (
          <span className="h-8 w-28 animate-pulse rounded bg-muted/70" />
        ) : (
          <span className="text-2xl font-bold text-foreground transition-all duration-500">
            <MetricValue value={block.value} />
          </span>
        )}
        {!isLoading && block.trend && (
          <span
            className={`text-sm font-medium ${getTrendColor(block.trend.direction)}`}
          >
            {getTrendArrow(block.trend.direction)} {block.trend.percentage}%
          </span>
        )}
      </div>
      {isLoading ? (
        <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-muted/60" />
      ) : block.subtitle ? (
        <p className="mt-1 text-xs text-muted-foreground">{block.subtitle}</p>
      ) : null}
    </div>
  );
}

function KPIGrid({ block }: { block: KPIGridBlock }): ReactElement {
  const cols = block.columns ?? 4;
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {block.cards.map((card) => (
        <MetricCard key={card.id} block={card} />
      ))}
    </div>
  );
}

function TopPosts({ block }: { block: TopPostsBlock }): ReactElement {
  const isList = block.layout !== 'grid';
  const hydratableBlock = block as HydratableBlock<TopPostsBlock>;
  const isLoading = hydratableBlock.hydration?.status === 'loading';

  if (isLoading) {
    return (
      <div
        className={
          isList ? 'space-y-2' : 'grid grid-cols-2 gap-3 sm:grid-cols-3'
        }
      >
        {Array.from({ length: isList ? 4 : 3 }).map((_, index) => (
          <div
            key={`top-post-loading-${index}`}
            className={`rounded-lg border border-border bg-card p-3 ${
              isList ? 'flex items-center gap-3' : ''
            }`}
          >
            <div
              className={`animate-pulse rounded bg-muted/70 ${
                isList ? 'h-12 w-12 shrink-0' : 'mb-2 h-32 w-full'
              }`}
            />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted/70" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted/60" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={isList ? 'space-y-2' : 'grid grid-cols-2 gap-3 sm:grid-cols-3'}
    >
      {block.posts.map((post) => (
        <div
          key={post.id}
          className={`rounded-lg border border-border bg-card p-3 ${
            isList ? 'flex items-center gap-3' : ''
          }`}
        >
          {post.thumbnail && (
            <img
              src={post.thumbnail}
              alt={post.title ?? 'Post thumbnail'}
              className={`rounded object-cover ${
                isList ? 'h-12 w-12 shrink-0' : 'mb-2 h-32 w-full'
              }`}
            />
          )}
          <div className="min-w-0 flex-1">
            {post.title && (
              <p className="truncate text-sm font-medium text-foreground">
                {post.title}
              </p>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {post.platform && <span>{post.platform}</span>}
              {post.views != null && (
                <span>{post.views.toLocaleString()} views</span>
              )}
              {post.engagement != null && (
                <span>{post.engagement.toLocaleString()} eng.</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function AlertBanner({ block }: { block: AlertBlock }): ReactElement {
  const styles = getAlertStyles(block.severity);
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-4 ${styles.border} ${styles.bg}`}
    >
      <span className={`text-lg ${styles.text}`}>{styles.icon}</span>
      <div className="min-w-0 flex-1">
        {block.title && (
          <p className={`text-sm font-semibold ${styles.text}`}>
            {block.title}
          </p>
        )}
        <p className="text-sm text-foreground">{block.message}</p>
      </div>
    </div>
  );
}

function SectionHeader({ block }: { block: SectionHeaderBlock }): ReactElement {
  const level = block.level ?? 2;

  if (level === 1) {
    return <h1 className="text-xl font-bold text-foreground">{block.text}</h1>;
  }

  if (level === 3) {
    return (
      <h3 className="text-base font-semibold text-foreground">{block.text}</h3>
    );
  }

  return (
    <h2 className="text-lg font-semibold text-foreground">{block.text}</h2>
  );
}

function TextParagraph({ block }: { block: TextParagraphBlock }): ReactElement {
  return (
    <p className="text-sm leading-relaxed text-foreground">{block.text}</p>
  );
}

function BulletList({ block }: { block: BulletListBlock }): ReactElement {
  const ListTag = block.ordered ? 'ol' : 'ul';

  return (
    <ListTag
      className={`space-y-1 pl-5 text-sm text-foreground ${
        block.ordered ? 'list-decimal' : 'list-disc'
      }`}
    >
      {block.items.map((item, index) => (
        <li key={`${block.id}-item-${index}`}>{item}</li>
      ))}
    </ListTag>
  );
}

function Callout({ block }: { block: CalloutBlock }): ReactElement {
  const severityStyles: Record<
    NonNullable<CalloutBlock['tone']>,
    { border: string; bg: string; text: string }
  > = {
    error: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      text: 'text-red-300',
    },
    info: {
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/30',
      text: 'text-blue-300',
    },
    success: {
      bg: 'bg-green-500/10',
      border: 'border-green-500/30',
      text: 'text-green-300',
    },
    warning: {
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/30',
      text: 'text-yellow-300',
    },
  };
  const tone = block.tone ?? 'info';
  const styles = severityStyles[tone];

  return (
    <div className={`rounded-lg border p-3 ${styles.border} ${styles.bg}`}>
      <p className={`text-sm ${styles.text}`}>{block.message}</p>
    </div>
  );
}

function MarkdownContent({ block }: { block: MarkdownBlock }): ReactElement {
  return (
    <SafeMarkdown
      content={block.content}
      className="prose prose-sm max-w-none text-foreground"
    />
  );
}

function ImageGrid({ block }: { block: ImageGridBlock }): ReactElement {
  const cols = block.columns ?? 3;
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {block.images.map((image, index) => (
        <div key={index} className="overflow-hidden rounded-lg">
          <img
            src={image.url}
            alt={image.alt ?? ''}
            className="h-auto w-full object-cover"
          />
          {image.caption && (
            <p className="mt-1 text-xs text-muted-foreground">
              {image.caption}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ block }: { block: EmptyStateBlock }): ReactElement {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-12 text-center">
      {block.icon && <span className="text-3xl">{block.icon}</span>}
      <p className="text-sm font-medium text-foreground">{block.message}</p>
      {block.ctaLabel && (
        <button
          type="button"
          className="mt-2 rounded bg-primary px-4 py-2 text-xs font-black text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {block.ctaLabel}
        </button>
      )}
    </div>
  );
}

function BlockRenderer({ block }: { block: AgentUIBlock }): ReactElement {
  switch (block.type) {
    case 'metric_card':
      return <MetricCard block={block} />;
    case 'kpi_grid':
      return <KPIGrid block={block} />;
    case 'chart':
      return <DynamicChart block={block as ChartBlock} />;
    case 'table':
      return <DynamicTable block={block as TableBlock} />;
    case 'top_posts':
      return <TopPosts block={block} />;
    case 'alert':
      return <AlertBanner block={block} />;
    case 'section_header':
      return <SectionHeader block={block} />;
    case 'text_paragraph':
      return <TextParagraph block={block} />;
    case 'bullet_list':
      return <BulletList block={block} />;
    case 'callout':
      return <Callout block={block} />;
    case 'markdown':
      return <MarkdownContent block={block} />;
    case 'image_grid':
      return <ImageGrid block={block} />;
    case 'composite':
      return <CompositeLayout block={block as CompositeBlock} />;
    case 'empty_state':
      return <EmptyState block={block} />;
    default:
      return (
        <div className="rounded-lg border border-border bg-muted/50 p-4 text-xs text-muted-foreground">
          Unknown block type
        </div>
      );
  }
}

function DynamicBlockGrid({ blocks }: DynamicBlockGridProps): ReactElement {
  if (blocks.length === 0) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
        No blocks to display
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      {blocks.map((block) => {
        const hydratableBlock = block as HydratableBlock;

        return (
          <div
            key={block.id}
            className={`${getColSpan(block.width)} transition-all duration-500`}
            style={{
              animationDelay: `${hydratableBlock.hydration?.staggerMs ?? 0}ms`,
            }}
          >
            {block.title && block.type !== 'metric_card' && (
              <h3 className="mb-2 text-sm font-semibold text-foreground">
                {block.title}
              </h3>
            )}
            <BlockRenderer block={block} />
          </div>
        );
      })}
    </div>
  );
}

export default DynamicBlockGrid;
