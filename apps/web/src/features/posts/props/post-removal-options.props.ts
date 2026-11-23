import type { RefObject } from 'react';

export interface PostRemovalOptionsProps {
  hasMedia: boolean;
  hasPublished: boolean;
  includeMediaRef: RefObject<boolean>;
}
