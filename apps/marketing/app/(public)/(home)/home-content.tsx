import HomeAgents from '@web-components/home/_agents';
import HomeAsks from '@web-components/home/_asks';
import HomeCTA from '@web-components/home/_cta';
import HomeFaq from '@web-components/home/_faq';
import HomeFooter from '@web-components/home/_footer';
import HomeHero from '@web-components/home/_hero';
import HomeHow from '@web-components/home/_how';
import HomeLoop from '@web-components/home/_loop';
import HomeProduct from '@web-components/home/_product';
import HomeProviders from '@web-components/home/_providers';
import HomeReveal from '@web-components/home/_reveal';

export default function HomeContent() {
  return (
    <HomeReveal>
      <HomeHero />
      <HomeProduct />
      <HomeLoop />
      <HomeAgents />
      <HomeHow />
      <HomeAsks />
      <HomeProviders />
      <HomeFaq />
      <HomeCTA />
      <HomeFooter />
    </HomeReveal>
  );
}
