'use client';

import { HStack, VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';

interface Testimonial {
  kpi: string;
  kpiLabel: string;
  name: string;
  quote: string;
  role: string;
}

// Placeholder testimonials — replace with real customer quotes before GA.
const TESTIMONIALS: Testimonial[] = [
  {
    kpi: '10×',
    kpiLabel: 'monthly output volume',
    name: 'Maya K.',
    quote:
      'We went from three posts a week to forty assets a month with the same two-person team. Cost per asset dropped from ~$35 with freelancers to under $2, and engagement held.',
    role: 'Head of Growth, DTC skincare brand',
  },
  {
    kpi: '+31%',
    kpiLabel: 'ad click-through rate',
    name: 'Daniel R.',
    quote:
      'Generating eight ad variants per angle changed how we test. CTR is up 31% since we started iterating on hooks weekly instead of monthly — the readout tells us what to kill.',
    role: 'Founder, ecommerce accessories',
  },
  {
    kpi: '18% → 29%',
    kpiLabel: 'short-form hook rate',
    name: 'Sofia L.',
    quote:
      'One brief becomes the reel, the carousel, the caption, and the article. Our hook rate on shorts went from 18% to 29% in three weeks because we finally test variants instead of guessing.',
    role: 'Content Lead, marketing agency',
  },
];

export default function HomeTestimonials(): React.ReactElement {
  return (
    <section className="gen-section-spacing-lg border-b border-edge/5">
      <div className="container mx-auto px-6">
        <VStack className="mb-12 max-w-3xl gap-4">
          <Heading
            as="h2"
            className="text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl"
          >
            Operators measure the difference.
          </Heading>
          <Text className="max-w-2xl text-base leading-7 gen-text-muted">
            More output, cheaper output, and a readout that says which content
            moved the numbers.
          </Text>
        </VStack>

        <div className="grid grid-cols-1 gap-px bg-edge/5 lg:grid-cols-3">
          {TESTIMONIALS.map((testimonial) => (
            <figure
              key={testimonial.name}
              className="flex flex-col gap-6 bg-background p-8"
            >
              <div>
                <Text className="text-3xl font-semibold tracking-[-0.03em] text-surface">
                  {testimonial.kpi}
                </Text>
                <Text className="mt-1 text-xs uppercase tracking-[0.14em] text-surface/40">
                  {testimonial.kpiLabel}
                </Text>
              </div>

              <blockquote className="flex-1">
                <Text className="text-sm leading-7 text-surface/70">
                  &ldquo;{testimonial.quote}&rdquo;
                </Text>
              </blockquote>

              <figcaption>
                <HStack className="items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-full bg-card text-xs font-semibold text-surface/60">
                    {testimonial.name.charAt(0)}
                  </div>
                  <VStack className="gap-0">
                    <Text className="text-sm font-semibold text-surface">
                      {testimonial.name}
                    </Text>
                    <Text className="text-xs text-surface/45">
                      {testimonial.role}
                    </Text>
                  </VStack>
                </HStack>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
