import type { HowStep } from '@props/website/home.props';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';

const LOOP_STEPS: HowStep[] = [
  {
    description: 'Start from what is working in your market, not a blank page.',
    title: 'Trends',
  },
  {
    description: 'Remix it into every format you publish, on your brand.',
    title: 'Create',
  },
  {
    description: 'Review, schedule and publish to your connected channels.',
    title: 'Publish',
  },
  {
    description:
      'See which posts worked. Top posts become examples for the next brief.',
    title: 'Analytics',
  },
];

/**
 * The half of the product a generator does not have: what happens before the
 * brief and after the file.
 */
export default function HomeLoop(): React.ReactElement {
  return (
    <section
      id="loop"
      className="gen-section-spacing border-b border-foreground/5"
    >
      <div className="container mx-auto px-6">
        <div className="mb-10 flex max-w-3xl flex-col gap-4" data-reveal="up">
          <Text className="text-xs font-bold uppercase tracking-[0.16em] text-foreground/80">
            What it manages
          </Text>
          <Heading
            id="home-loop-heading"
            as="h2"
            className="text-4xl font-semibold leading-tight tracking-[-0.02em] sm:text-5xl"
          >
            It does not stop at the file.
          </Heading>
          <Text className="max-w-2xl text-base leading-7 gen-text-muted">
            A generator hands you a file. Genfeed runs the whole loop for all
            your content, so the next brief starts from what worked.
          </Text>
        </div>

        <ol
          aria-labelledby="home-loop-heading"
          className="grid grid-cols-1 gap-px bg-foreground/10 sm:grid-cols-2 lg:grid-cols-4"
        >
          {LOOP_STEPS.map((step, index) => (
            <li
              key={step.title}
              className="flex flex-col gap-3 bg-background p-8"
              data-reveal="up"
            >
              <Text className="text-xs font-bold tabular-nums text-foreground/50">
                0{index + 1}
              </Text>
              <Heading
                as="h3"
                className="text-xl font-semibold text-foreground"
              >
                {step.title}
              </Heading>
              <Text className="text-sm leading-6 text-foreground/80">
                {step.description}
              </Text>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
