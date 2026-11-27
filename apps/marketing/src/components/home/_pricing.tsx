import PricingStrip from '@ui/marketing/PricingStrip';
import { Heading } from '@ui/typography/heading';

/** The same four columns the pricing page sells, before the questions. */
export default function HomePricing(): React.ReactElement {
  return (
    <section
      id="pricing"
      className="gen-section-spacing border-b border-foreground/5"
    >
      <div className="container mx-auto px-6">
        <Heading
          as="h2"
          className="mb-10 text-4xl font-semibold leading-tight tracking-[-0.02em] sm:text-5xl"
          data-reveal="up"
        >
          What it costs
        </Heading>
        <PricingStrip className="mb-0" />
      </div>
    </section>
  );
}
