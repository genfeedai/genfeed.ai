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
      'Describe the campaign, brand, or product. One prompt sets the direction for everything that follows.',
    step: '01',
    title: 'Start from a brief',
  },
  {
    description:
      'Images, reels, ads, articles, captions, voice, and clips, produced from that single brief, on brand.',
    step: '02',
    title: 'Generate every format',
  },
  {
    description:
      'Ship across every channel, then see which posts and ads actually drove results.',
    step: '03',
    title: 'Publish and track',
  },
];

export default function HomeHow(): React.ReactElement {
  return (
    <section id="how" className="gen-section-spacing-lg border-b border-edge/5">
      <div className="container mx-auto px-6">
        <VStack className="mb-10 max-w-3xl gap-4">
          <Text className={EYEBROW_CLASS}>How it works</Text>
          <Heading
            as="h2"
            className="text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl"
          >
            Brief in, campaign out.
          </Heading>
          <Text className="max-w-2xl text-base leading-7 gen-text-muted">
            Three steps. No tool-switching, no production bottleneck between the
            idea and the post.
          </Text>
        </VStack>

        <div className="grid grid-cols-1 gap-px bg-edge/5 sm:grid-cols-3">
          {HOW_STEPS.map((item) => (
            <div
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
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
