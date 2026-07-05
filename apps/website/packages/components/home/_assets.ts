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
  outputWall: home('generated-output-wall.png'),
} as const;
