'use client';

import HomeBrandOS from '@web-components/home/_brand-os';
import HomeCTA from '@web-components/home/_cta';
import HomeFooter from '@web-components/home/_footer';
import HomeHero from '@web-components/home/_hero';
import HomePricing from '@web-components/home/_pricing';

export default function HomeContent() {
  return (
    <>
      <HomeHero />
      <HomeBrandOS />
      <HomePricing />
      <HomeCTA />
      <HomeFooter />
    </>
  );
}
