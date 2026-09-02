import type { HowStep } from '@props/website/home.props';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';

const EYEBROW_CLASS =
  'text-xs font-bold uppercase tracking-widest text-surface/72';

const HOW_STEPS: HowStep[] = [
  {
    description: 'Describe the campaign or drop in a reference.',
    step: '01',
    title: 'Brief',
  },
  {
    description: 'Genfeed creates every format. You review and refine.',
    step: '02',
    title: 'Create & review',
  },
  {
    description: 'Schedule everywhere and learn what should come next.',
    step: '03',
    title: 'Publish & learn',
  },
];

export default function HomeHow(): React.ReactElement {
  return (
    <section id="how" className="gen-section-spacing border-b border-edge/5">
      <div className="container mx-auto px-6">
        <div className="flex flex-col mb-10 max-w-3xl gap-4">
          <Text className={EYEBROW_CLASS}>How it works</Text>
          <Heading
            id="home-workflow-heading"
            as="h2"
            className="text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl"
          >
            Brief to published.
          </Heading>
          <Text className="max-w-2xl text-base leading-7 gen-text-muted">
            Three steps, one workspace.
          </Text>
        </div>

        <ol
          aria-labelledby="home-workflow-heading"
          className="grid grid-cols-1 gap-px bg-edge/5 sm:grid-cols-3"
        >
          {HOW_STEPS.map((item) => (
            <li
              key={item.step}
              className="flex flex-col gap-3 bg-background p-8"
            >
              <Text className="text-sm font-black tracking-[-0.02em] text-surface/72">
                {item.step}
              </Text>
              <Heading as="h3" className="text-xl font-semibold text-surface">
                {item.title}
              </Heading>
              <Text className="text-sm leading-6 text-surface/72">
                {item.description}
              </Text>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
