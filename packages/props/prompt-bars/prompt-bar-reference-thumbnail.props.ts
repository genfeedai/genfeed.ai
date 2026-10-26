import type { MediaReference } from '@genfeedai/contracts/interfaces';

export interface PromptBarReferenceThumbnailProps {
  alt: string;
  className?: string;
  isPriority?: boolean;
  reference: MediaReference;
  referenceSource: 'brand' | 'ingredient' | '';
  size: number;
}
