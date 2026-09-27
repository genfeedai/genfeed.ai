import { Heading } from '@ui/typography/heading';
import AgentFirstActions from '@web-components/buttons/agent-first-actions/AgentFirstActions';

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
            className="text-5xl font-semibold leading-none tracking-[-0.03em] sm:text-6xl"
          >
            Start with one brief.
          </Heading>

          <div className="flex flex-row items-center flex-wrap justify-center gap-3">
            <AgentFirstActions trackingName="home_cta_click" />
          </div>
        </div>
      </div>
    </section>
  );
}
