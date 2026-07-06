import { cdnAsset } from '@helpers/media/cdn/cdn.helper';

// Homepage marketing imagery is served from the Genfeed CDN
// (s3://cdn.genfeed.ai/assets/branding/website/home/**), not committed to the
// website `public/` folder — keeps ~2 MB of binaries out of the repo and lets
// the assets be refreshed without a code deploy. URLs are built from the shared
// cdnAsset() helper so the CDN base is defined in exactly one place.
const home = (file: string) =>
  cdnAsset(`/assets/branding/website/home/${file}`);

export const HOME_ASSETS = {
  formats: {
    ads: home('formats/ads.webp'),
    articles: home('formats/articles.webp'),
    avatars: home('formats/avatars.webp'),
    images: home('formats/images.webp'),
    reels: home('formats/reels.webp'),
    voice: home('formats/voice.webp'),
  },
} as const;

export const HOME_OUTPUT_WALL_ASSETS = [
  {
    alt: 'Generated product photography contact sheet for a launch campaign',
    src: HOME_ASSETS.formats.images,
  },
  {
    alt: 'Generated short-form video frame staged for a reels campaign',
    src: HOME_ASSETS.formats.reels,
  },
  {
    alt: 'Generated ad creative variations in multiple campaign ratios',
    src: HOME_ASSETS.formats.ads,
  },
  {
    alt: 'Generated article layout with hero imagery and editorial blocks',
    src: HOME_ASSETS.formats.articles,
  },
  {
    alt: 'Generated avatar clip frame for a spoken campaign asset',
    src: HOME_ASSETS.formats.avatars,
  },
  {
    alt: 'Generated voiceover campaign asset with audio production visuals',
    src: HOME_ASSETS.formats.voice,
  },
] as const;
