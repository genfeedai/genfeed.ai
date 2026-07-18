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
      'Keep Claude Code or Codex as your workbench. Connect once through the standard MCP transport.',
    step: '01',
    title: 'Create in your AI client',
  },
  {
    description:
      'Curated, scoped actions send assets and distribution work into the right brand workspace.',
    step: '02',
    title: 'Route through Genfeed',
  },
  {
    description:
      'Review the output, enforce brand policy, and require human approval before consequential actions.',
    step: '03',
    title: 'Approve and publish',
  },
  {
    description:
      'Track channel performance, content outcomes, and the full audit trail in one analytics layer.',
    step: '04',
    title: 'Measure what shipped',
  },
];

export default function HomeHow(): React.ReactElement {
  return (
    <section id="how" className="gen-section-spacing-lg border-b border-edge/5">
      <div className="container mx-auto px-6">
        <VStack className="mb-10 max-w-3xl gap-4">
          <Text className={EYEBROW_CLASS}>Agent to outcome</Text>
          <Heading
            id="distribution-loop-heading"
            as="h2"
            className="text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl"
          >
            Your AI client creates. Genfeed controls distribution.
          </Heading>
          <Text className="max-w-2xl text-base leading-7 gen-text-muted">
            Claude Code and Codex stay focused on the work. Genfeed adds scoped
            MCP actions, approvals, publishing, and analytics around it.
          </Text>
        </VStack>

        <ol
          aria-labelledby="distribution-loop-heading"
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
