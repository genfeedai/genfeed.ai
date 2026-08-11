import { getPublicArticleBySlugCached } from '@website/(content)/articles/[slug]/article-loader';
import { getArticleCoverPalette } from '@website/(content)/articles/article-cover.palette';
import { ImageResponse } from 'next/og';

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
  { params }: RouteContext<'/articles/[slug]/og'>,
): Promise<ImageResponse> {
  const { slug } = await params;
  const article = await getPublicArticleBySlugCached(slug).catch(() => null);

  const palette = getArticleCoverPalette(slug);
  const label = article?.label?.trim() || 'Genfeed.ai';
  const category = article?.category?.trim();
  const summary = article?.summary?.trim();
  const artwork = article?.coverImageUrl?.trim();

  return new ImageResponse(
    <div
      style={{
        background: `radial-gradient(120% 140% at 12% 0%, ${palette.to} 0%, ${palette.from} 52%, ${palette.base} 100%)`,
        display: 'flex',
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
            color: palette.accent,
            display: 'flex',
            fontSize: 24,
            letterSpacing: '0.24em',
            textTransform: 'uppercase',
          }}
        >
          {category || 'Article'}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            maxWidth: '860px',
          }}
        >
          <div
            style={{
              color: '#ffffff',
              display: 'flex',
              fontSize: label.length > 60 ? 60 : 74,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
            }}
          >
            {label}
          </div>

          {summary && (
            <div
              style={{
                color: 'rgba(255,255,255,0.62)',
                display: 'flex',
                fontSize: 28,
                lineHeight: 1.35,
              }}
            >
              {summary.length > 140 ? `${summary.slice(0, 137)}…` : summary}
            </div>
          )}
        </div>

        <div
          style={{
            alignItems: 'center',
            borderTop: `1px solid ${palette.accent}`,
            color: 'rgba(255,255,255,0.72)',
            display: 'flex',
            fontSize: 26,
            letterSpacing: '0.2em',
            paddingTop: '28px',
            textTransform: 'uppercase',
          }}
        >
          genfeed.ai
        </div>
      </div>
    </div>,
    {
      ...SIZE,
      headers: {
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    },
  );
}
