import { CardPadding, CardVariant } from '@genfeedai/contracts';
import type { HomeOutputAsset } from '@props/website/home.props';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { HOME_OUTPUT_CAROUSEL_ASSETS } from '@web-components/home/_assets';
import { Play } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

function posterFor(format: string): string {
  const asset: HomeOutputAsset | undefined = HOME_OUTPUT_CAROUSEL_ASSETS.find(
    (item) => item.format === format,
  );
  if (!asset) throw new Error(`No homepage asset for "${format}"`);
  return asset.poster;
}

const TREND_TILES: readonly {
  format: string;
  isPlayable: boolean;
  label: string;
  where: string;
}[] = [
  {
    format: 'Short-form video',
    isPlayable: true,
    label: 'Get ready with me, 3 steps',
    where: 'TikTok',
  },
  {
    format: 'Images',
    isPlayable: false,
    label: 'Texture close-up, no text',
    where: 'Instagram',
  },
];

function MarketTile({
  badge,
  className = '',
  isPlayable = false,
  label,
  src,
  where,
}: {
  badge: string;
  className?: string;
  isPlayable?: boolean;
  label: string;
  src: string;
  where: string;
}): React.ReactElement {
  return (
    <li className={`relative overflow-hidden rounded-md bg-card ${className}`}>
      <Image
        alt=""
        className="object-cover"
        fill
        sizes="(min-width: 1024px) 20vw, 50vw"
        src={src}
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgba(5,6,7,0.92))]" />
      {isPlayable ? (
        <span
          aria-hidden="true"
          className={
            'absolute left-1/2 top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm' /* design-system-allow-content-color -- control over video */
          }
        >
          <Play className="size-5 fill-current" />
        </span>
      ) : null}
      <span className="absolute right-3 top-3">
        <Badge casing="normal" variant="overlay">
          {badge}
        </Badge>
      </span>
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-4">
        <Text
          className={
            'text-base font-semibold text-white' /* design-system-allow-content-color -- caption over image */
          }
        >
          {label}
        </Text>
        <Text
          className={
            'text-xs text-white/70' /* design-system-allow-content-color -- caption over image */
          }
        >
          {where}
        </Text>
      </div>
    </li>
  );
}

/**
 * The paid differentiator, shown instead of described. What each side holds
 * matches the rows of the pricing page's compare table: every account gets the
 * shared market trends feed; a plan adds the niche feed, competitor ads and
 * trend videos that play inside Genfeed.
 */
export default function HomeMarket(): React.ReactElement {
  return (
    <section
      id="market"
      className="gen-section-spacing-lg border-b border-foreground/5"
    >
      <div className="container mx-auto px-6">
        <div className="flex max-w-3xl flex-col gap-5" data-reveal="up">
          <Text className="text-xs font-semibold uppercase tracking-label text-foreground/80">
            Before the brief
          </Text>
          <Heading
            as="h2"
            className="text-5xl font-semibold leading-[0.98] tracking-[-0.02em] text-foreground sm:text-6xl"
          >
            Start from what is already working
          </Heading>
          <Text className="max-w-2xl text-base leading-7 text-foreground/80 md:text-lg">
            See what is trending in your market and which ads your competitors
            keep running. Pick one, and Genfeed remixes it on your brand.
          </Text>
        </div>

        <Card className="mt-14" data-reveal="up" padding={CardPadding.SM}>
          <Card variant={CardVariant.INSET}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-foreground/5 pb-4">
              <div>
                <Text className="text-2xs font-semibold uppercase tracking-label text-foreground/60">
                  An example trends view
                </Text>
                <Text className="mt-1 block text-sm text-foreground">
                  Trending formats and a competitor ad worth remixing
                </Text>
              </div>
              <Badge casing="normal" size="xl" variant="outline">
                Your niche, on a plan
              </Badge>
            </div>

            <ul
              aria-label="Example trends and competitor ads"
              className="mt-4 grid auto-rows-[15rem] grid-cols-2 gap-2 sm:gap-3 lg:auto-rows-[17rem] lg:grid-cols-4"
            >
              {TREND_TILES.map((tile) => (
                <MarketTile
                  badge="Trend"
                  isPlayable={tile.isPlayable}
                  key={tile.label}
                  label={tile.label}
                  src={posterFor(tile.format)}
                  where={tile.where}
                />
              ))}
              <MarketTile
                badge="Competitor ad"
                className="col-span-2"
                label="Before and after, 9:16"
                src={posterFor('Ads')}
                where="Saved to your ads wall"
              />
            </ul>
          </Card>
        </Card>

        <div
          className="mt-6 grid gap-px bg-foreground/10 sm:grid-cols-2"
          data-reveal="up"
        >
          <div className="flex flex-col gap-1 bg-background p-6">
            <Text className="text-sm font-semibold text-foreground">
              Every account
            </Text>
            <Text className="text-sm leading-6 text-foreground/80">
              The shared market trends feed.
            </Text>
          </div>
          <div className="flex flex-col gap-1 bg-background p-6">
            <Text className="text-sm font-semibold text-foreground">
              On a plan
            </Text>
            <Text className="text-sm leading-6 text-foreground/80">
              Trends in your niche, competitor ads to save and remix, and trend
              videos that play inside Genfeed.{' '}
              <Link
                className="font-semibold underline underline-offset-4"
                href="/pricing"
              >
                See plans
              </Link>
            </Text>
          </div>
        </div>
      </div>
    </section>
  );
}
