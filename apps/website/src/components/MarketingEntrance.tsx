'use client';

import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import type { MarketingEntranceProps } from '@props/website/marketing-entrance.props';

/**
 * The client island for a server-rendered marketing page.
 *
 * Pages used to be client components only to call `useMarketingEntrance`, so
 * every line of their copy shipped as JavaScript and hydrated before the page
 * answered a tap. Wrapping the server-rendered tree in this component keeps the
 * same entrance animation while the page itself stays on the server — the same
 * split `home/_reveal.tsx` already uses on the home page.
 */
export default function MarketingEntrance({
  cards,
  children,
  hero,
  sections,
}: MarketingEntranceProps): React.ReactElement {
  const containerRef = useMarketingEntrance({ cards, hero, sections });

  return <div ref={containerRef}>{children}</div>;
}
