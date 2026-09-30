import { isMarketingOgCard } from '@data/marketing-og.data';
import { renderMarketingOg } from '@web-components/og/marketing-og';

export const revalidate = 3600;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ card: string }> },
) {
  const { card } = await params;
  if (!isMarketingOgCard(card)) {
    return new Response('Not found', { status: 404 });
  }

  return await renderMarketingOg(card);
}
