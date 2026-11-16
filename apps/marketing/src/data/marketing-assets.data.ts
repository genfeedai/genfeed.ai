import { cdnAsset } from '@helpers/media/cdn/cdn.helper';

const asset = (name: string) => cdnAsset(`/assets/site/shared/${name}.webp`);

export const MARKETING_ASSETS = {
  campaign: {
    alt: 'Generated amber glass product campaign in a sunlit terracotta studio',
    src: asset('campaign'),
  },
  creator: {
    alt: 'Generated editorial portrait of a creative director in a blue studio',
    src: asset('creator'),
  },
} as const;
