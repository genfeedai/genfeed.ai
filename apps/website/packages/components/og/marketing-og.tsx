import { MARKETING_OG_CARDS, MARKETING_OG_SIZE } from '@data/marketing-og.data';
import { loadMarketingSatoriFonts } from '@genfeedai/fonts/og';
import { BrandMark } from '@website/(content)/articles/[slug]/og/brand-mark';
import { ImageResponse } from 'next/og';

async function loadArtwork(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type')?.split(';')[0];
    if (contentType !== 'image/jpeg' && contentType !== 'image/png')
      return null;

    const data = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${data.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function renderMarketingOg(
  kind: keyof typeof MARKETING_OG_CARDS,
): Promise<ImageResponse> {
  const card = MARKETING_OG_CARDS[kind];
  const [artwork, fonts] = await Promise.all([
    loadArtwork(card.artwork),
    loadMarketingSatoriFonts(),
  ]);

  return new ImageResponse(
    <div
      style={{
        backgroundColor: '#0b0c0d',
        color: '#faf6ed',
        display: 'flex',
        height: '100%',
        position: 'relative',
        width: '100%',
      }}
    >
      {artwork ? (
        // biome-ignore lint/performance/noImgElement: Satori needs a plain image.
        <img
          alt=""
          height={MARKETING_OG_SIZE.height}
          src={artwork}
          style={{ height: '100%', position: 'absolute', width: '100%' }}
          width={MARKETING_OG_SIZE.width}
        />
      ) : (
        <div
          style={{
            alignItems: 'center',
            display: 'flex',
            fontFamily: 'Satoshi',
            fontSize: 32,
            gap: 16,
            left: 54,
            position: 'absolute',
            top: 50,
          }}
        >
          <BrandMark fill="#faf6ed" size={48} />
          <div style={{ display: 'flex' }}>genfeed.ai</div>
        </div>
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'Zodiak',
          fontSize: 58,
          fontWeight: 400,
          left: 40,
          letterSpacing: '-0.04em',
          lineHeight: 1.16,
          position: 'absolute',
          top: 230,
          width: 400,
        }}
      >
        {card.headline.map((line) => (
          <div key={line} style={{ display: 'flex' }}>
            {line}
          </div>
        ))}
      </div>
    </div>,
    {
      ...MARKETING_OG_SIZE,
      fonts,
      headers: {
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    },
  );
}
