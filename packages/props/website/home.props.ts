export interface StatItemProps {
  end: number;
  suffix: string;
  label: string;
  index: number;
}

export interface DemoCardProps {
  title: string;
  description: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  platform?: string;
}

export interface OutputFormat {
  description: string;
  title: string;
}

export interface HowStep {
  description: string;
  step: string;
  title: string;
}

export interface HeroVideoProps {
  alt: string;
  mp4Src: string;
  posterSrc: string;
  webmSrc: string;
}

/**
 * One card in the homepage output rail.
 *
 * The still is required and the clip is not. A card whose clip has not been
 * generated yet is a normal state, not a broken one — it renders as the still
 * it already had, and starts moving the day its clip is published.
 */
export interface HomeOutputAsset {
  alt: string;
  format: string;
  mp4?: string;
  poster: string;
  title: string;
  webm?: string;
}

export interface HomeOutputCardProps {
  asset: HomeOutputAsset;
  /** The rail preloads only the first card; the rest wait until they scroll in. */
  isPreloaded: boolean;
}
