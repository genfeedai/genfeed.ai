import { cdnAsset } from '@genfeedai/helpers/media/cdn/cdn.helper';

/**
 * Generated examples rotated beside the login and sign-up forms. Every clip is
 * Genfeed output (Replicate, the same providers the product routes to), served
 * from s3://cdn.genfeed.ai/assets/site/auth/ like the other marketing media.
 * Each poster is frame 0 of its own encoded MP4: replace the two together.
 */
const auth = (file: string) => cdnAsset(`/assets/site/auth/${file}`);

export const AUTH_SHOWCASE_SLIDE_DEFINITIONS = [
  {
    id: 'rooftop-gym',
    modelLabel: 'Seedance 2.0 Fast',
    posterSrc: auth('rooftop-gym-poster.webp'),
    videoSrc: auth('rooftop-gym.mp4'),
  },
  {
    id: 'neon-night-run',
    modelLabel: 'Veo 3.1 Fast',
    posterSrc: auth('neon-night-run-poster.webp'),
    videoSrc: auth('neon-night-run.mp4'),
  },
  {
    id: 'anime-fight',
    modelLabel: 'Kling 2.5 Turbo Pro',
    posterSrc: auth('anime-fight-poster.webp'),
    videoSrc: auth('anime-fight.mp4'),
  },
  {
    id: 'city-courier',
    modelLabel: 'Seedance 2.0 Fast',
    posterSrc: auth('city-courier-poster.webp'),
    videoSrc: auth('city-courier.mp4'),
  },
] as const;

export type AuthShowcaseSlideId =
  (typeof AUTH_SHOWCASE_SLIDE_DEFINITIONS)[number]['id'];
