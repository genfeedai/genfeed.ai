'use client';

import HomeAudiences from '@web-components/home/_audiences';
import HomeCredits from '@web-components/home/_credits';
import HomeCTA from '@web-components/home/_cta';
import HomeFAQ from '@web-components/home/_faq';
import HomeFooter from '@web-components/home/_footer';
import HomeFormats from '@web-components/home/_formats';
import HomeHero from '@web-components/home/_hero';
import HomeHow from '@web-components/home/_how';
import HomeProof from '@web-components/home/_proof';

export default function HomeContent() {
  return (
    <>
      <HomeHero />
      <HomeFormats />
      <HomeHow />
      <HomeProof />
      <HomeAudiences />
      <HomeCredits />
      <HomeFAQ />
      <HomeCTA />
      <HomeFooter />
    </>
  );
}
