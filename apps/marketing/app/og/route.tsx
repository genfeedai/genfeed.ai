import { renderMarketingOg } from '@web-components/og/marketing-og';

export const revalidate = 3600;

export async function GET() {
  return await renderMarketingOg('default');
}
