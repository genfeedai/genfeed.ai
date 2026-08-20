import { loadSatoshiSatoriFonts } from '@genfeedai/fonts/og';
import { getPublicArticleBySlugCached } from '@website/(content)/articles/[slug]/article-loader';
import { getArticleCoverPalette } from '@website/(content)/articles/article-cover.palette';
import { ImageResponse } from 'next/og';
import { BrandMark } from './brand-mark';
import { getHeadlineSize, truncateHeadline } from './headline';

const SIZE = { height: 630, width: 1200 };

/**
 * Per-article social card. A shared default card makes every link in a feed
 * look like the same link — which is exactly the surface where these articles
 * are meant to earn a click.
 *
 * The article's own artwork is the card background; the headline is composited
 * over it here rather than baked into the image, so a copy edit never requires
 * regenerating art. Articles without artwork fall back to a gradient derived
 * from the slug, matching the in-page cover.
 *
 * This is a plain route handler rather than Next's `opengraph-image.tsx`
 * convention: that convention hashes the route name whenever a route group is
 * in the parent path (`(content)` here) and appends a metadata id segment, so
 * its URL cannot be written down. `generateMetadata` and the article JSON-LD
 * both need to name this image, so it gets a stable path instead.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<ImageResponse> {
  const { slug } = await params;
  const article = await getPublicArticleBySlugCached(slug).catch(() => null);

  const palette = getArticleCoverPalette(slug);
  const label = article?.label?.trim() || 'Genfeed.ai';
  const category = article?.category?.trim();
  const artwork = article?.coverImageUrl?.trim();

  /**
   * The card carries the headline and nothing else — every unfurl surface
   * already prints the summary as body text beside the image, so repeating it
   * here costs the headline a third of the card and reads as a stutter. With
   * that space back the type can run large enough to survive a thumbnail.
   */
  const headline = truncateHeadline(label);
  const headlineSize = getHeadlineSize(headline);

  return new ImageResponse(
    <div
      style={{
        background: `radial-gradient(120% 140% at 12% 0%, ${palette.to} 0%, ${palette.from} 52%, ${palette.base} 100%)`,
        display: 'flex',
        fontFamily: 'Satoshi',
        height: '100%',
        position: 'relative',
        width: '100%',
      }}
    >
      {artwork && (
        // biome-ignore lint/performance/noImgElement: ImageResponse renders through satori, which only understands plain <img> — next/image never runs here.
        <img
          alt=""
          height={SIZE.height}
          src={artwork}
          style={{
            height: '100%',
            left: 0,
            objectFit: 'cover',
            position: 'absolute',
            top: 0,
            width: '100%',
          }}
          width={SIZE.width}
        />
      )}

      {/* Keeps the headline readable over whatever the artwork does behind it. */}
      <div
        style={{
          background:
            'linear-gradient(100deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.78) 42%, rgba(0,0,0,0.15) 100%)',
          height: '100%',
          left: 0,
          position: 'absolute',
          top: 0,
          width: '100%',
        }}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          justifyContent: 'space-between',
          padding: '72px',
          position: 'relative',
          width: '100%',
        }}
      >
        <div
          style={{
            alignSelf: 'flex-start',
            backgroundColor: 'rgba(255,255,255,0.08)',
            border: `1px solid ${palette.accent}`,
            borderRadius: '999px',
            color: palette.accent,
            display: 'flex',
            fontSize: 22,
            fontWeight: 500,
            letterSpacing: '0.18em',
            padding: '12px 22px 12px 26px',
            textTransform: 'uppercase',
          }}
        >
          {category || 'Article'}
        </div>

        <div
          style={{
            color: '#ffffff',
            display: 'flex',
            fontSize: headlineSize,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            maxWidth: '960px',
          }}
        >
          {headline}
        </div>

        {/* No rule above it: a hairline has none of the headline's mass, so
            over a light cover it dissolves. The mark holds the corner on its
            own, and unlike a wordmark it does not repeat the domain that every
            unfurl surface already prints in its own chrome. */}
        <BrandMark fill="#ffffff" size={76} />
      </div>
    </div>,
    {
      ...SIZE,
      fonts: await loadSatoshiSatoriFonts(),
      headers: {
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    },
  );
}
