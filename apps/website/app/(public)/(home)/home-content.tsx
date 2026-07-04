'use client';

import HomeCTA from '@web-components/home/_cta';
import HomeFooter from '@web-components/home/_footer';
import HomeFormats from '@web-components/home/_formats';
import HomeHero from '@web-components/home/_hero';
import HomePricing from '@web-components/home/_pricing';
import HomeTestimonials from '@web-components/home/_testimonials';

export default function HomeContent() {
  return (
    <>
      <HomeHero />
      <HomeFormats />
      <HomeTestimonials />
      <HomePricing />
      <HomeCTA />
      <HomeFooter />
    </>
  );
}
