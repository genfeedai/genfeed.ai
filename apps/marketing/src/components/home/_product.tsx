import { CardPadding, CardVariant } from '@genfeedai/contracts';
import type {
  HomeBoardMediaProps,
  HomeBoardTextProps,
  HomeOutputAsset,
} from '@props/website/home.props';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { HOME_OUTPUT_CAROUSEL_ASSETS } from '@web-components/home/_assets';
import { Play } from 'lucide-react';
import Image from 'next/image';

/** The board draws the rail's own assets, so the two can never disagree. */
function assetFor(format: string): HomeOutputAsset {
  const asset = HOME_OUTPUT_CAROUSEL_ASSETS.find(
    (item) => item.format === format,
  );
  if (!asset) throw new Error(`No homepage asset for "${format}"`);
  return asset;
}

const WAVEFORM: readonly number[] = [
  30, 55, 80, 45, 95, 60, 35, 70, 100, 50, 75, 40, 90, 65, 30, 85, 55, 95, 45,
  70, 35, 60, 80, 50, 100, 40, 65, 30, 75, 55, 90, 45,
];

const TILE = 'relative overflow-hidden rounded-md bg-card';

function PieceCaption({
  destination,
  isOverMedia,
  label,
}: {
  destination: string;
  isOverMedia: boolean;
  label: string;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-0.5">
      <Text
        className={
          isOverMedia
            ? 'text-base font-semibold text-white' /* design-system-allow-content-color -- caption over image */
            : 'text-base font-semibold text-foreground'
        }
      >
        {label}
      </Text>
      <Text
        className={
          isOverMedia
            ? 'text-xs text-white/70' /* design-system-allow-content-color -- caption over image */
            : 'text-xs text-foreground/60'
        }
      >
        {destination}
      </Text>
    </div>
  );
}

function MediaPiece({
  asset,
  className = '',
  destination,
  detail,
  isPlayable = false,
  label,
}: HomeBoardMediaProps): React.ReactElement {
  return (
    <li className={`${TILE} ${className}`} data-reveal="scale">
      <Image
        alt={asset.alt}
        className="object-cover"
        fill
        sizes="(max-width: 1024px) 50vw, 560px"
        src={asset.poster}
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
      {detail ? (
        <span className="absolute right-3 top-3">
          <Badge casing="normal" variant="overlay">
            {detail}
          </Badge>
        </span>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 p-4">
        <PieceCaption destination={destination} isOverMedia label={label} />
      </div>
    </li>
  );
}

function TextPiece({
  children,
  className = '',
  destination,
  label,
}: HomeBoardTextProps): React.ReactElement {
  return (
    <li
      className={`${TILE} flex flex-col justify-between gap-4 p-4 ${className}`}
      data-reveal="scale"
    >
      <div aria-hidden="true" className="flex min-h-0 flex-col gap-2.5">
        {children}
      </div>
      <PieceCaption
        destination={destination}
        isOverMedia={false}
        label={label}
      />
    </li>
  );
}

function Line({ width }: { width: string }): React.ReactElement {
  return (
    <span
      className="block h-2 rounded-full bg-foreground/10"
      style={{ width }}
    />
  );
}

/**
 * The scope of the product, shown as one campaign rather than a format list.
 *
 * A grid of format names reads as an inventory. One brief with every piece it
 * produced, each drawn in its own shape (a clip, a post, an article, an email,
 * a waveform), says the same thing as a result the reader can picture.
 */
export default function HomeProduct(): React.ReactElement {
  return (
    <section
      id="everything"
      className="gen-section-spacing-lg border-b border-foreground/5"
    >
      <div className="container mx-auto px-6">
        <div className="flex max-w-3xl flex-col gap-5" data-reveal="up">
          <Text
            className="text-xs font-bold uppercase tracking-[0.16em] text-foreground/80"
            data-testid="home-product-eyebrow"
          >
            Not just video
          </Text>
          <Heading
            as="h2"
            className="text-5xl font-semibold leading-[0.98] tracking-[-0.02em] text-foreground sm:text-6xl"
            data-testid="home-product-heading"
          >
            One agent for all your content.
          </Heading>
          <Text className="max-w-2xl text-base leading-7 text-foreground/80 md:text-lg">
            Ask once and the whole campaign comes back: video, images, ads,
            posts, articles, newsletters and voice. On your brand, sized for
            each channel, ready for review.
          </Text>
        </div>

        <Card
          className="mt-14"
          padding={CardPadding.SM}
          data-reveal="up"
          data-testid="home-product-workspace"
        >
          <Card variant={CardVariant.INSET}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-foreground/5 pb-4">
              <div>
                <Text className="text-2xs font-bold uppercase tracking-[0.14em] text-foreground/60">
                  You asked
                </Text>
                <Text className="mt-1 block text-sm text-foreground">
                  &ldquo;Launch the hydration serum this week.&rdquo;
                </Text>
              </div>
              <Badge casing="normal" size="xl" variant="outline">
                8 drafts ready for review
              </Badge>
            </div>

            <ul className="mt-4 grid grid-flow-dense auto-rows-[13rem] grid-cols-2 gap-2 sm:gap-3 lg:auto-rows-[15rem] lg:grid-cols-4">
              <MediaPiece
                asset={assetFor('Short-form video')}
                className="row-span-2"
                destination="Reels, TikTok, Shorts"
                detail="0:24"
                isPlayable
                label="Short-form video"
              />

              <TextPiece destination="X, LinkedIn, Threads" label="Posts">
                <span className="flex items-center gap-2">
                  <span className="size-6 rounded-full bg-foreground/15" />
                  <Line width="5rem" />
                </span>
                <Text className="text-sm leading-6 text-foreground">
                  Your skin drinks first. Eight hours of hydration in one step.
                  Out Friday.
                </Text>
              </TextPiece>

              <MediaPiece
                asset={assetFor('Images')}
                destination="Instagram, Pinterest, your store"
                label="Images"
              />

              <MediaPiece
                asset={assetFor('Presenter video')}
                className="row-span-2"
                destination="One face, one voice"
                detail="0:38"
                isPlayable
                label="Presenter video"
              />

              <TextPiece destination="Your blog" label="Articles">
                <Text className="text-base font-semibold leading-snug text-foreground">
                  Why hydration starts before moisturizer
                </Text>
                <Line width="100%" />
                <Line width="92%" />
                <Line width="64%" />
              </TextPiece>

              <TextPiece destination="Your list" label="Newsletters">
                <Text className="text-2xs font-bold uppercase tracking-[0.14em] text-foreground/60">
                  Subject
                </Text>
                <Text className="text-sm font-semibold text-foreground">
                  The serum lands Friday
                </Text>
                <Line width="100%" />
                <Line width="78%" />
              </TextPiece>

              <MediaPiece
                asset={assetFor('Ads')}
                className="col-span-2"
                destination="Every ratio, ready for the ad account"
                detail="9:16 · 1:1 · 16:9"
                label="Ads"
              />

              <TextPiece
                className="col-span-2"
                destination="Voice-overs and podcasts"
                label="Voice"
              >
                <span className="flex h-20 items-center gap-1">
                  {WAVEFORM.map((height, index) => (
                    <span
                      // biome-ignore lint/suspicious/noArrayIndexKey: a fixed decorative waveform
                      key={index}
                      className="w-full rounded-full bg-foreground/25"
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </span>
              </TextPiece>
            </ul>
          </Card>
        </Card>
      </div>
    </section>
  );
}
