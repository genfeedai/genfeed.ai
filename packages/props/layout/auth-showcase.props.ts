export type AuthShowcaseVariant = 'wall' | 'hero' | 'stack';

export interface AuthShowcaseProps {
  /** Short value line shown over the media. */
  headline: string;
  /** One supporting sentence under the headline. */
  description: string;
  /** The product loop, in order (create, review, publish). */
  steps: string[];
  variant: AuthShowcaseVariant;
}
