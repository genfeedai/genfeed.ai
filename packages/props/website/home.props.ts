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

/** One generated clip in the homepage output rail. */
export interface HomeOutputAsset {
  alt: string;
  format: string;
  mp4: string;
  poster: string;
  title: string;
  webm: string;
}

export interface HomeOutputCardProps {
  asset: HomeOutputAsset;
  /** The rail preloads only the first card; the rest wait until they scroll in. */
  isPreloaded: boolean;
}
