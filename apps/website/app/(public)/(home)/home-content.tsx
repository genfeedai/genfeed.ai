import HomeCTA from '@web-components/home/_cta';
import HomeFooter from '@web-components/home/_footer';
import HomeFormats from '@web-components/home/_formats';
import HomeHero from '@web-components/home/_hero';
import HomeHow from '@web-components/home/_how';
import HomeProduct from '@web-components/home/_product';
import HomeReveal from '@web-components/home/_reveal';
import ProofWinners from '@web-components/proof/ProofWinners';

export default function HomeContent() {
  return (
    <HomeReveal>
      <HomeHero />
      <HomeProduct />
      <ProofWinners />
      <HomeHow />
      <HomeFormats />
      <HomeCTA />
      <HomeFooter />
    </HomeReveal>
  );
}
