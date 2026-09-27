import type { UseMarketingEntranceOptions } from '@hooks/ui/use-marketing-entrance';
import type { ReactNode } from 'react';

/**
 * The serializable half of `UseMarketingEntranceOptions`. A server-rendered
 * page passes these across the client boundary, so no animation objects
 * (`extra`) — those carry functions.
 */
export interface MarketingEntranceProps
  extends Pick<UseMarketingEntranceOptions, 'cards' | 'hero' | 'sections'> {
  children?: ReactNode;
}
