import { AGENT_PROMPTS } from '@data/agent-prompts.data';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import Link from 'next/link';

/**
 * What you can ask the agent for.
 *
 * This section carries the job the old format grid failed: showing what is
 * possible without reading as an inventory. Each row is a request in the
 * reader's own words and the thing that comes back, and links to the page for
 * that audience — which is where articles about these jobs send their traffic.
 */
export default function HomeAsks(): React.ReactElement {
  return (
    <section
      id="asks"
      className="gen-section-spacing-lg border-b border-edge/5"
    >
      <div className="container mx-auto px-6">
        <div className="mb-16 grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(320px,0.55fr)] lg:items-end">
          <div className="flex flex-col gap-4" data-reveal="up">
            <Heading
              as="h2"
              className="max-w-3xl text-5xl font-semibold leading-tight tracking-[-0.04em] sm:text-6xl"
            >
              Ask for the job, not the file.
            </Heading>
            <Text className="max-w-2xl text-base leading-7 gen-text-muted">
              Say what you want in a sentence. The agent makes it, keeps it on
              brand, and puts it in front of you before it goes out.
            </Text>
          </div>

          <div className="lg:justify-self-end" data-reveal="up">
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'see_agent_asks' }}
              trackingName="home_asks_click"
              variant={ButtonVariant.SECONDARY}
            >
              <Link href="/agent">See what the agent does</Link>
            </ButtonTracked>
          </div>
        </div>

        <ul className="grid grid-cols-1 gap-x-12 border-t border-edge/5 sm:grid-cols-2">
          {AGENT_PROMPTS.map((prompt) => (
            <li
              key={prompt.ask}
              className="border-b border-edge/5 py-8"
              data-reveal="up"
            >
              <Heading
                as="h3"
                className="text-xl font-semibold tracking-[-0.025em] text-surface"
              >
                &ldquo;{prompt.ask}&rdquo;
              </Heading>
              <Text className="mt-3 text-sm leading-6 text-surface/72">
                {prompt.result}
              </Text>
              <Link
                className="mt-4 inline-flex text-[13px] font-semibold text-surface/72 underline underline-offset-4 transition-colors hover:text-surface"
                href={prompt.href}
              >
                {prompt.hrefLabel}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
