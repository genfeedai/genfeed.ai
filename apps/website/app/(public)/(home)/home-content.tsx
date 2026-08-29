import HomeCTA from '@web-components/home/_cta';
import HomeFooter from '@web-components/home/_footer';
import HomeFormats from '@web-components/home/_formats';
import HomeHero from '@web-components/home/_hero';
import HomeHow from '@web-components/home/_how';
import ProofWinners from '@web-components/proof/ProofWinners';

export default function HomeContent() {
  return (
    <>
      <HomeHero />
      <HomeHow />
      <HomeFormats />
      <ProofWinners />
      <HomeCTA />
      <HomeFooter />
    </>
  );
}
