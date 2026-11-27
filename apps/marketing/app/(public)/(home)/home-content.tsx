import HomeAgents from '@web-components/home/_agents';
import HomeAsks from '@web-components/home/_asks';
import HomeCTA from '@web-components/home/_cta';
import HomeFaq from '@web-components/home/_faq';
import HomeFooter from '@web-components/home/_footer';
import HomeHero from '@web-components/home/_hero';
import HomeHow from '@web-components/home/_how';
import HomeLoop from '@web-components/home/_loop';
import HomeMarket from '@web-components/home/_market';
import HomePricing from '@web-components/home/_pricing';
import HomeProduct from '@web-components/home/_product';
import HomeProviders from '@web-components/home/_providers';
import HomeReveal from '@web-components/home/_reveal';
import type { ReactNode } from 'react';

interface HomeContentProps {
  /** The real-posts section, which loads its data and so is passed in by the page. */
  proof?: ReactNode;
}

export default function HomeContent({ proof }: HomeContentProps) {
  return (
    <HomeReveal>
      <HomeHero />
      <HomeProduct />
      <HomeMarket />
      <HomeLoop />
      <HomeAgents />
      <HomeHow />
      <HomeAsks />
      {proof}
      <HomeProviders />
      <HomePricing />
      <HomeFaq />
      <HomeCTA />
      <HomeFooter />
    </HomeReveal>
  );
}
