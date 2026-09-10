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

/**
 * One "say this, get that" pair.
 *
 * The homepage sells what the agent can be asked for, not the formats it
 * supports: a capability list invites a feature comparison, a request the
 * reader recognises does not. `href` sends them to the page for that job.
 */
export interface AgentPrompt {
  /** What the reader would type, in their words. */
  ask: string;
  /** What comes back, concrete enough to picture. */
  result: string;
  /** The audience page that continues this promise. */
  href: string;
  /** Short label for the destination link. */
  hrefLabel: string;
}
