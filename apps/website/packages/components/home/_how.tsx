'use client';

import type { HowStep } from '@props/website/home.props';
import { VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';

const EYEBROW_CLASS =
  'text-xs font-bold uppercase tracking-widest text-surface/65';

const HOW_STEPS: HowStep[] = [
  {
    description:
      'Describe the campaign or drop in a reference. Genfeed drafts platform-native posts, images, and video from a single brief.',
    step: '01',
    title: 'Start from a brief',
  },
  {
    description:
      'Edit copy, regenerate variants, and enforce brand voice in the workspace before anything goes out.',
    step: '02',
    title: 'Review and refine',
  },
  {
    description:
      'Approve, then schedule to every connected channel from one shared calendar.',
    step: '03',
    title: 'Schedule and publish',
  },
  {
    description:
      'Track reach, engagement, and hook rate across every channel in one analytics view.',
    step: '04',
    title: 'Measure what shipped',
  },
];

export default function HomeHow(): React.ReactElement {
  return (
    <section id="how" className="gen-section-spacing-lg border-b border-edge/5">
      <div className="container mx-auto px-6">
        <VStack className="mb-10 max-w-3xl gap-4">
          <Text className={EYEBROW_CLASS}>Brief to published</Text>
          <Heading
            id="home-workflow-heading"
            as="h2"
            className="text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl"
          >
            Create, review, schedule, and publish — in one place.
          </Heading>
          <Text className="max-w-2xl text-base leading-7 gen-text-muted">
            Genfeed is one workspace for the whole content loop: generate on
            brand, keep a human in the approval seat, publish everywhere, and
            see what landed.
          </Text>
        </VStack>

        <ol
          aria-labelledby="home-workflow-heading"
          className="grid grid-cols-1 gap-px bg-edge/5 sm:grid-cols-2 lg:grid-cols-4"
        >
          {HOW_STEPS.map((item) => (
            <li
              key={item.step}
              className="flex flex-col gap-3 bg-background p-8"
            >
              <Text className="text-sm font-black tracking-[-0.02em] text-surface/30">
                {item.step}
              </Text>
              <Heading as="h3" className="text-xl font-semibold text-surface">
                {item.title}
              </Heading>
              <Text className="text-sm leading-6 text-surface/70">
                {item.description}
              </Text>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
