import type { RefObject } from 'react';

export interface PostRemovalOptionsProps {
  deleteOnPlatformRef: RefObject<boolean>;
  /** Some selected post is published on a network Genfeed can delete on. */
  hasPlatformDeletable: boolean;
  hasMedia: boolean;
  hasPublished: boolean;
  includeMediaRef: RefObject<boolean>;
}
