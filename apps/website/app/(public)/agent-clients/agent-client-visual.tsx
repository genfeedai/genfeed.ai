import { getPageMarketingAsset } from '@data/page-marketing-assets.data';
import type { AgentClientVisualProps } from '@props/agent-client.props';
import AgentClientLogo from '@web-components/content/AgentClientLogo';
import { ArrowRight, Check, ImageIcon, Video } from 'lucide-react';
import Image from 'next/image';

export default function AgentClientVisual({
  client,
  channelName,
}: AgentClientVisualProps): React.ReactElement {
  const asset = getPageMarketingAsset(`/${client.slug}`);
  return (
    <figure className="w-full max-w-2xl overflow-hidden rounded-2xl border border-edge/10 bg-card">
      <div className="flex items-center justify-between gap-4 border-b border-edge/10 px-5 py-4 text-sm text-surface/75">
        <span className="flex items-center gap-3 font-semibold text-surface">
          <AgentClientLogo client={client} />
          {client.name}
          <ArrowRight aria-hidden className="size-4 text-surface/50" />
          Genfeed
        </span>
        <span className="text-xs">Integration preview</span>
      </div>
      <div className="relative aspect-[3/2]">
        <Image
          alt={asset.alt}
          className="object-cover"
          fill
          preload
          sizes="(min-width: 1024px) 55vw, 100vw"
          src={asset.src}
        />
      </div>
      <figcaption className="grid grid-cols-3 gap-3 border-t border-edge/10 px-5 py-4 text-xs leading-5 text-surface/75">
        <span className="flex items-center gap-2">
          <ImageIcon aria-hidden className="size-4 shrink-0" />
          Brand context
        </span>
        <span className="flex items-center gap-2">
          <Video aria-hidden className="size-4 shrink-0" />
          Creative tools
        </span>
        <span className="flex items-center gap-2">
          <Check aria-hidden className="size-4 shrink-0" />
          {channelName ?? 'Your workspace'}
        </span>
      </figcaption>
    </figure>
  );
}
