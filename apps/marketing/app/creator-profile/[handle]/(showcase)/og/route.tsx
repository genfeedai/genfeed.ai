import { loadSatoshiSatoriFonts } from '@genfeedai/fonts/og';
import { BrandMark } from '@web-components/og/brand-mark';
import { ImageResponse } from 'next/og';
import { getDrawableArtwork } from '../articles/[slug]/og/artwork';
import { getPublicBrandBySlug } from '../creator-loader';

const SIZE = { height: 630, width: 1200 };
/** The banner keeps its own 3:1 ratio across the full width of the card. */
const BANNER_HEIGHT = 400;
const LOGO_SIZE = 168;

/**
 * A creator's social card, 1200x630 for X, LinkedIn and every other unfurl.
 * The banner is uploaded at the X header ratio (3:1), which a large card would
 * crop by a third, so it is drawn whole across the top and the logo, name and
 * handle sit under it. Without a banner the top is a plain gradient.
 *
 * A plain route handler for the same reason as the article card: the
 * `(showcase)` route group makes `opengraph-image.tsx` URLs unpredictable.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ handle: string }> },
): Promise<ImageResponse> {
  const { handle } = await params;
  const brand = await getPublicBrandBySlug(handle).catch(() => null);
  const canonicalHandle = brand?.slug || handle;
  const name = brand?.label?.trim() || `@${canonicalHandle}`;
  const banner = getDrawableArtwork(brand?.bannerUrl);
  const logo = getDrawableArtwork(brand?.logoUrl);

  return new ImageResponse(
    <div
      style={{
        backgroundColor: '#000000',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Satoshi',
        height: '100%',
        position: 'relative',
        width: '100%',
      }}
    >
      <div
        style={{
          background:
            'linear-gradient(120deg, #1f1f23 0%, #0b0b0d 60%, #000000 100%)',
          display: 'flex',
          height: BANNER_HEIGHT,
          width: '100%',
        }}
      >
        {banner ? (
          // biome-ignore lint/performance/noImgElement: ImageResponse renders through satori, which only understands plain <img> — next/image never runs here.
          <img
            alt=""
            height={BANNER_HEIGHT}
            src={banner}
            style={{ height: '100%', objectFit: 'cover', width: '100%' }}
            width={SIZE.width}
          />
        ) : null}
      </div>

      <div
        style={{
          alignItems: 'flex-end',
          bottom: 56,
          display: 'flex',
          gap: 36,
          left: 64,
          position: 'absolute',
          right: 64,
        }}
      >
        {logo ? (
          // biome-ignore lint/performance/noImgElement: ImageResponse renders through satori, which only understands plain <img> — next/image never runs here.
          <img
            alt=""
            height={LOGO_SIZE}
            src={logo}
            style={{
              border: '6px solid #000000',
              borderRadius: 32,
              height: LOGO_SIZE,
              objectFit: 'cover',
              width: LOGO_SIZE,
            }}
            width={LOGO_SIZE}
          />
        ) : null}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 1,
            gap: 6,
            minWidth: 0,
          }}
        >
          <div
            style={{
              color: '#ffffff',
              display: 'flex',
              fontSize: 60,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
            }}
          >
            {name.length > 32 ? `${name.slice(0, 31)}…` : name}
          </div>
          <div
            style={{
              color: 'rgba(255,255,255,0.65)',
              display: 'flex',
              fontSize: 32,
            }}
          >
            genfeed.ai/@{canonicalHandle}
          </div>
        </div>
        <BrandMark fill="#ffffff" size={64} />
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
