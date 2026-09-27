import { LAUNCH_ARTICLES } from './launch-articles';
import { SEO_ARTICLES_WAVE_1 } from './seo-articles-wave-1';
import { SEO_ARTICLES_WAVE_2 } from './seo-articles-wave-2';
import { SEO_ARTICLES_WAVE_3 } from './seo-articles-wave-3';
import { SEO_ARTICLES_WAVE_4 } from './seo-articles-wave-4';

export const UPCOMING_SEO_ARTICLES = [
  ...SEO_ARTICLES_WAVE_1,
  ...SEO_ARTICLES_WAVE_2,
  ...SEO_ARTICLES_WAVE_3,
  ...SEO_ARTICLES_WAVE_4,
] as const;

export const SEO_ARTICLES = [
  ...LAUNCH_ARTICLES,
  ...UPCOMING_SEO_ARTICLES,
] as const;
