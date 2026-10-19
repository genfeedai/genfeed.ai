export type BrandAvatarSize = 'sm' | 'md' | 'lg';

export interface BrandAvatarProps {
  /** Brand name: the image alt text and the source of the fallback initial. */
  name: string;
  /** Brand logo. The first letter of `name` shows when it is missing. */
  logoUrl?: string | null;
  size?: BrandAvatarSize;
  className?: string;
}
