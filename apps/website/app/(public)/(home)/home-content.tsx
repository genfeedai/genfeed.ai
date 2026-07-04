'use client';

import HomeCTA from '@web-components/home/_cta';
import HomeFooter from '@web-components/home/_footer';
import HomeFormats from '@web-components/home/_formats';
import HomeHero from '@web-components/home/_hero';
import HomePricing from '@web-components/home/_pricing';

// NOTE: a testimonials section was removed pending real, attributable customer
// quotes (the previous version used fabricated ones). Rebuild it with genuine
// testimonials before re-adding — the prior component is in git history.
export default function HomeContent() {
  return (
    <>
      <HomeHero />
      <HomeFormats />
      <HomePricing />
      <HomeCTA />
      <HomeFooter />
    </>
  );
}
