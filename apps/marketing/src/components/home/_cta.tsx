import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import AgentFirstActions from '@web-components/buttons/agent-first-actions/AgentFirstActions';
import Link from 'next/link';

export default function HomeCTA(): React.ReactElement {
  return (
    <section className="gen-section-spacing-lg relative overflow-hidden">
      <div className="container mx-auto px-6 relative z-10">
        <div
          className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center"
          data-reveal="up"
        >
          <Heading
            as="h2"
            className="text-5xl font-semibold leading-none tracking-[-0.02em] sm:text-6xl"
          >
            Start with one brief.
          </Heading>

          <div className="flex flex-row items-center flex-wrap justify-center gap-3">
            <AgentFirstActions trackingName="home_cta_click" />
          </div>
          <Text as="p" className="text-sm text-foreground/80">
            <Link
              className="font-semibold underline underline-offset-4"
              href="/pricing"
            >
              See plans and pricing
            </Link>
          </Text>
        </div>
      </div>
    </section>
  );
}
