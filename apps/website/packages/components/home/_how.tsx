import type { HowStep } from '@props/website/home.props';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';

const EYEBROW_CLASS =
  'text-xs font-bold uppercase tracking-widest text-surface/72';

const HOW_STEPS: HowStep[] = [
  {
    description: 'Say what you want, or drop in a reference.',
    step: '01',
    title: 'Ask',
  },
  {
    description: 'Create videos, images and posts using your brand context.',
    step: '02',
    title: 'Create',
  },
  {
    description:
      'Review, publish and use the results to plan your next campaign.',
    step: '03',
    title: 'Grow',
  },
];

export default function HomeHow(): React.ReactElement {
  return (
    <section id="how" className="gen-section-spacing border-b border-edge/5">
      <div className="container mx-auto px-6">
        <div className="flex flex-col mb-10 max-w-3xl gap-4" data-reveal="up">
          <Text className={EYEBROW_CLASS}>How it works</Text>
          <Heading
            id="home-workflow-heading"
            as="h2"
            className="text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl"
          >
            Watch it work.
          </Heading>
          <Text className="max-w-2xl text-base leading-7 gen-text-muted">
            Brand memory, drafts and results live in one workspace. Approve the
            drafts, then schedule them for your connected channels.
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
              data-reveal="up"
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
