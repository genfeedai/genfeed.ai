// Homepage marketing imagery is served from the Genfeed CDN
// (s3://cdn.genfeed.ai/assets/branding/website/home/**), not committed to the
// website `public/` folder — keeps ~2 MB of binaries out of the repo and lets
// the assets be refreshed without a code deploy. Fixed prod CDN host matches
// the existing branding/PWA asset convention (see packages/ui pwa.helper.ts).
const HOME_ASSET_BASE = 'https://cdn.genfeed.ai/assets/branding/website/home';

export const HOME_ASSETS = {
  formats: {
    ads: `${HOME_ASSET_BASE}/formats/ads.webp`,
    articles: `${HOME_ASSET_BASE}/formats/articles.webp`,
    avatars: `${HOME_ASSET_BASE}/formats/avatars.webp`,
    images: `${HOME_ASSET_BASE}/formats/images.webp`,
    reels: `${HOME_ASSET_BASE}/formats/reels.webp`,
    voice: `${HOME_ASSET_BASE}/formats/voice.webp`,
  },
  outputWall: `${HOME_ASSET_BASE}/generated-output-wall.png`,
} as const;
