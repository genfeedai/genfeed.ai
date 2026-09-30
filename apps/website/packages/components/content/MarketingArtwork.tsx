import { MARKETING_ASSETS } from '@data/marketing-assets.data';
import type { MarketingArtworkProps } from '@props/marketing-artwork.props';
import Image from 'next/image';

export default function MarketingArtwork({
  kind,
  isCompact = false,
}: MarketingArtworkProps): React.ReactElement {
  const asset = MARKETING_ASSETS[kind];
  return (
    <figure
      className={`relative w-full overflow-hidden rounded-xl ${isCompact ? 'aspect-[16/7]' : 'aspect-[3/2]'}`}
    >
      <Image
        alt={asset.alt}
        className="object-cover"
        fill
        preload
        sizes="(min-width: 1024px) 55vw, 100vw"
        src={asset.src}
      />
    </figure>
  );
}
