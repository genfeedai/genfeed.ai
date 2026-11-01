'use client';

import { AgentMediaArtifactPreview } from '@genfeedai/agent/components/AgentMediaArtifactPreview';
import CompositeLayout from '@genfeedai/agent/components/blocks/CompositeLayout';
import DynamicChart from '@genfeedai/agent/components/blocks/DynamicChart';
import DynamicTable from '@genfeedai/agent/components/blocks/DynamicTable';
import { formatAnimatedValue } from '@genfeedai/agent/components/blocks/metric-value-format.util';
import {
  ButtonVariant,
  CardVariant,
  ComponentSize,
} from '@genfeedai/contracts';
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
  MetricCardBlock,
  SectionHeaderBlock,
  TableBlock,
  TextParagraphBlock,
  TopPostsBlock,
} from '@genfeedai/contracts/interfaces';
import { keyListItems } from '@genfeedai/helpers/ui/list/key-list-items';
import Card from '@ui/card/Card';
import MetricCardUI from '@ui/cards/metric-card/MetricCard';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { EmptyState } from '@ui/primitives/empty-state';
import Image from 'next/image';
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

type BlockTone = NonNullable<CalloutBlock['tone']>;

const BLOCK_TONE_VARIANTS: Record<
  BlockTone,
  'destructive' | 'info' | 'success' | 'warning'
> = {
  error: 'destructive',
  info: 'info',
  success: 'success',
  warning: 'warning',
};

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
  const trendPercentage = block.trend?.percentage;
  const signedTrend =
    typeof trendPercentage === 'number'
      ? block.trend?.direction === 'down'
        ? -Math.abs(trendPercentage)
        : Math.abs(trendPercentage)
      : undefined;

  return (
    <MetricCardUI
      description={block.subtitle}
      isLoading={isLoading}
      label={block.title || 'Metric'}
      size="md"
      trend={signedTrend}
      value={isLoading ? '' : <MetricValue value={block.value} />}
    />
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

function topPostBodyClassName(isList: boolean): string {
  return isList ? 'flex-row items-center gap-3 p-3' : 'gap-0 p-3';
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
          <Card
            // biome-ignore lint/suspicious/noArrayIndexKey: Fixed layout slots have positional identity and no item state.
            key={`top-post-loading-${index}`}
            bodyClassName={topPostBodyClassName(isList)}
            variant={CardVariant.BORDERED}
          >
            <div
              className={`animate-pulse rounded bg-muted/70 ${
                isList ? 'size-12 shrink-0' : 'mb-2 h-32 w-full'
              }`}
            />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted/70" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted/60" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div
      className={isList ? 'space-y-2' : 'grid grid-cols-2 gap-3 sm:grid-cols-3'}
    >
      {block.posts.map((post) => (
        <Card
          key={post.id}
          bodyClassName={topPostBodyClassName(isList)}
          variant={CardVariant.BORDERED}
        >
          {post.thumbnail && (
            <Image
              width={320}
              height={180}
              unoptimized
              src={post.thumbnail}
              alt={post.title ?? 'Post thumbnail'}
              className={`rounded object-cover ${
                isList ? 'size-12 shrink-0' : 'mb-2 h-32 w-full'
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
              {post.platform && (
                <PlatformBadge
                  platform={post.platform}
                  size={ComponentSize.SM}
                />
              )}
              {post.views != null && (
                <span>{post.views.toLocaleString()} views</span>
              )}
              {post.engagement != null && (
                <span>{post.engagement.toLocaleString()} eng.</span>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function AlertBanner({ block }: { block: AlertBlock }): ReactElement {
  return (
    <Alert variant={BLOCK_TONE_VARIANTS[block.severity ?? 'info']}>
      {block.title ? <AlertTitle>{block.title}</AlertTitle> : null}
      <AlertDescription>{block.message}</AlertDescription>
    </Alert>
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
      {keyListItems(block.items, (item) => item).map(({ item, key }) => (
        <li key={key}>{item}</li>
      ))}
    </ListTag>
  );
}

function Callout({ block }: { block: CalloutBlock }): ReactElement {
  return (
    <Alert variant={BLOCK_TONE_VARIANTS[block.tone ?? 'info']}>
      {block.message}
    </Alert>
  );
}

function ImageGrid({ block }: { block: ImageGridBlock }): ReactElement {
  const cols = block.columns ?? 3;
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {block.images.map((image) => (
        <div key={image.url} className="overflow-hidden rounded-lg">
          <AgentMediaArtifactPreview
            displayMode="featured"
            assets={[
              {
                kind: 'image',
                url: image.url,
                alt: image.alt,
                title: image.alt ?? image.caption,
              },
            ]}
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

function EmptyBlock({ block }: { block: EmptyStateBlock }): ReactElement {
  return (
    <EmptyState
      actions={
        block.ctaLabel ? (
          <Button variant={ButtonVariant.DEFAULT} className="mt-2">
            {block.ctaLabel}
          </Button>
        ) : undefined
      }
      glyph={block.icon}
      surface="card"
      title={block.message}
    />
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
    case 'image_grid':
      return <ImageGrid block={block} />;
    case 'composite':
      return <CompositeLayout block={block as CompositeBlock} />;
    case 'empty_state':
      return <EmptyBlock block={block} />;
    default:
      return (
        <Alert size="sm" variant="note">
          Unknown block type
        </Alert>
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
