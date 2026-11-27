import { stringifyJsonLd } from '@data/json-ld';
import {
  buildMcpChannelJsonLd,
  buildMcpChannelPage,
  isMcpChannelSlug,
  MCP_CHANNEL_SLUGS,
} from '@data/mcp-channels.data';
import { createDynamicPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import McpChannelContent from '@public/mcp/mcp-channel-content';
import { withMarketingOgMetadata } from '@web-components/og/marketing-metadata';
import { notFound } from 'next/navigation';

export const dynamicParams = false;

export function generateStaticParams(): { channel: string }[] {
  return MCP_CHANNEL_SLUGS.map((channel) => ({ channel }));
}

function resolvePage(channel: string) {
  return isMcpChannelSlug(channel) ? buildMcpChannelPage(channel) : undefined;
}

const generate = createDynamicPageMetadata(
  'channel',
  (channel) => resolvePage(channel)?.title ?? 'MCP server',
  (channel) => `/mcp/${channel}`,
  (channel) => resolvePage(channel)?.description ?? '',
);

export async function generateMetadata(...args: Parameters<typeof generate>) {
  const { channel } = await args[0].params;
  return withMarketingOgMetadata(
    await generate(...args),
    `/mcp/${channel}`,
    resolvePage(channel)?.title ?? 'MCP server',
  );
}

export default async function McpChannelPage({
  params,
}: {
  params: Promise<{ channel: string }>;
}): Promise<React.ReactElement> {
  const { channel } = await params;

  if (!isMcpChannelSlug(channel)) {
    notFound();
  }

  const page = buildMcpChannelPage(channel);

  return (
    <>
      <script type="application/ld+json">
        {stringifyJsonLd(
          buildMcpChannelJsonLd(page, `https://genfeed.ai/mcp/${channel}`),
        )}
      </script>
      <McpChannelContent page={page} />
    </>
  );
}
