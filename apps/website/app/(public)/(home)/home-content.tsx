import HomeAudiences from '@web-components/home/_audiences';
import HomeCredits from '@web-components/home/_credits';
import HomeCTA from '@web-components/home/_cta';
import HomeFAQ from '@web-components/home/_faq';
import HomeFooter from '@web-components/home/_footer';
import HomeFormats from '@web-components/home/_formats';
import HomeHero from '@web-components/home/_hero';
import HomeHow from '@web-components/home/_how';
import ProofTestimonials from '@web-components/proof/ProofTestimonials';

/**
 * Server component. The landing page is static marketing markup, so none of it
 * needs to ship as JavaScript: the only interactive leaves are `ButtonTracked`
 * and the FAQ accordion, which stay client components and hydrate on their own.
 * Marking this composition root `'use client'` used to pull every section — plus
 * the footer and the testimonial data — into the client bundle for no behaviour.
 */
export default function HomeContent() {
  return (
    <>
      <HomeHero />
      <HomeHow />
      <HomeFormats />
      <ProofTestimonials context="landing" />
      <HomeAudiences />
      <HomeCredits />
      <HomeFAQ />
      <HomeCTA />
      <HomeFooter />
    </>
  );
}
