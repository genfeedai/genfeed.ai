import type { MediaReference } from '@genfeedai/contracts/interfaces/components/media-reference.interface';

export interface PromptBarReferenceThumbnailProps {
  alt: string;
  className?: string;
  isPriority?: boolean;
  reference: MediaReference;
  referenceSource?: 'brand' | 'ingredient' | '';
  size: number;
}
