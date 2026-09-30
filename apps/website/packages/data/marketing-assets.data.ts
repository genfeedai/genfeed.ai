import { cdnAsset } from '@helpers/media/cdn/cdn.helper';

const asset = (name: string) =>
  cdnAsset(`/assets/branding/website/editorial/${name}-v1.webp`);

export const MARKETING_ASSETS = {
  campaign: {
    alt: 'Generated amber glass product campaign in a sunlit terracotta studio',
    src: asset('campaign'),
  },
  creator: {
    alt: 'Generated editorial portrait of a creative director in a blue studio',
    src: asset('creator'),
  },
  publishing: {
    alt: 'Generated campaign imagery moving along a silver publishing rail',
    src: asset('publishing'),
  },
  workflow: {
    alt: 'Connected silver modules carrying a creative brief through a production workflow',
    src: asset('workflow'),
  },
  research: {
    alt: 'A glass prism illuminating photographic contact sheets with distinct signals',
    src: asset('research'),
  },
  integration: {
    alt: 'A silver connection branching into campaign imagery, film, and portrait outputs',
    src: asset('integration'),
  },
} as const;
