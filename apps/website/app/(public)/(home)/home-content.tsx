'use client';

import HomeCTA from '@web-components/home/_cta';
import HomeFooter from '@web-components/home/_footer';
import HomeHero from '@web-components/home/_hero';
import HomePricing from '@web-components/home/_pricing';
import UseCasesStrip from '@web-components/home/_use-cases-strip';
import HomeWorkflow from '@web-components/home/_workflow';

export default function HomeContent() {
  return (
    <>
      {/* Hero — agency-first Content OS */}
      <HomeHero />

      {/* Use cases — agency and multi-brand workflows */}
      <UseCasesStrip />

      {/* How it works — prompt -> research -> create -> publish -> track */}
      <div id="studio">
        <div id="publish">
          <div id="intelligence">
            <HomeWorkflow />
          </div>
        </div>
      </div>

      {/* Pricing — credits + service paths */}
      <HomePricing />

      {/* CTA — agency workflow invitation */}
      <HomeCTA />

      {/* Footer — amber wordmark */}
      <HomeFooter />
    </>
  );
}
