import HomeAsks from '@web-components/home/_asks';
import HomeCTA from '@web-components/home/_cta';
import HomeFooter from '@web-components/home/_footer';
import HomeHero from '@web-components/home/_hero';
import HomeHow from '@web-components/home/_how';
import HomeProduct from '@web-components/home/_product';
import HomeProviders from '@web-components/home/_providers';
import HomeReveal from '@web-components/home/_reveal';
import ProofWinners from '@web-components/proof/ProofWinners';

export default function HomeContent() {
  return (
    <HomeReveal>
      <HomeHero />
      <HomeProduct />
      <ProofWinners />
      <HomeHow />
      <HomeProviders />
      <HomeAsks />
      <HomeCTA />
      <HomeFooter />
    </HomeReveal>
  );
}
