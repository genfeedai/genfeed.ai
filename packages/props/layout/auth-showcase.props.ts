export type AuthShowcaseVariant = 'wall' | 'rotator' | 'bento' | 'video';

export interface AuthShowcaseProps {
  /** Short value line shown over the media. */
  headline: string;
  /** One supporting sentence under the headline. */
  description: string;
  /** The product loop, in order (create, review, publish). */
  steps: string[];
  /** Accessible name for the pause / play control of the video variant. */
  pauseLabel: string;
  playLabel: string;
  variant: AuthShowcaseVariant;
}
