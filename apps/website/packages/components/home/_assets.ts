import { cdnAsset } from '@helpers/media/cdn/cdn.helper';

// Homepage marketing imagery is served from the Genfeed CDN
// (s3://cdn.genfeed.ai/assets/branding/website/home/**), not committed to the
// website `public/` folder, keeping ~2 MB of binaries out of the repo and letting
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

export const HOME_OUTPUT_CAROUSEL_ASSETS = [
  {
    alt: 'Generated product photography contact sheet for a launch campaign',
    format: 'Product campaign',
    src: HOME_ASSETS.formats.images,
    title: 'One visual world',
  },
  {
    alt: 'Generated short-form video frame staged for a reels campaign',
    format: 'Short-form video',
    src: HOME_ASSETS.formats.reels,
    title: 'Made to move',
  },
  {
    alt: 'Generated ad creative variations in multiple campaign ratios',
    format: 'Ads & creative',
    src: HOME_ASSETS.formats.ads,
    title: 'Ready to perform',
  },
  {
    alt: 'Generated article layout with hero imagery and editorial blocks',
    format: 'Articles & newsletters',
    src: HOME_ASSETS.formats.articles,
    title: 'Ideas with depth',
  },
  {
    alt: 'Generated avatar clip frame for a spoken campaign asset',
    format: 'AI influencer',
    src: HOME_ASSETS.formats.avatars,
    title: 'Always on-brand',
  },
  {
    alt: 'Generated voiceover campaign asset with audio production visuals',
    format: 'Podcasts & voice',
    src: HOME_ASSETS.formats.voice,
    title: 'Worth listening to',
  },
] as const;
