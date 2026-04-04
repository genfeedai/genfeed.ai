'use client';

import { CardVariant } from '@genfeedai/enums';
import { useDelayedVisibility } from '@hooks/ui/use-delayed-visibility';
import { useIntersectionObserver } from '@hooks/ui/use-intersection-observer/use-intersection-observer';
import Card from '@ui/card/Card';
import { HStack, VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import {
  HiArrowPath,
  HiChartBar,
  HiLightBulb,
  HiSparkles,
} from 'react-icons/hi2';

interface HowStepProps {
  delay: number;
  description: string;
  icon: typeof HiChartBar;
  step: number;
  title: string;
}

const HOW_STEPS = [
  {
    description:
      "Track what's performing across TikTok, YouTube, and Instagram. Know what works before you create.",
    icon: HiChartBar,
    step: 1,
    title: "See What's Trending",
  },
  {
    description:
      'Get real-time alerts when topics in your niche start gaining momentum. Post before the wave peaks.',
    icon: HiLightBulb,
    step: 2,
    title: 'Ride the Wave Early',
  },
  {
    description:
      'Transform any content into your format. Turn articles into videos, podcasts into clips, ideas into posts.',
    icon: HiArrowPath,
    step: 3,
    title: 'Remix & Create',
  },
];

function HowStep({
  step,
  title,
  description,
  icon: Icon,
  delay,
}: HowStepProps) {
  const visible = useDelayedVisibility({ delay });

  return (
    <div
      className={`transition-all duration-700 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
    >
      <Card
        variant={CardVariant.DEFAULT}
        className="h-full relative overflow-hidden group p-6"
      >
        {/* Step number */}
        <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Text className="text-sm font-bold text-primary">{step}</Text>
        </div>

        {/* Icon */}
        <div className="p-3 bg-primary/10 w-fit mb-4">
          <Icon className="h-6 w-6 text-primary" />
        </div>

        {/* Content */}
        <Heading as="h3" className="text-xl font-semibold mb-2">
          {title}
        </Heading>
        <Text as="p" className="text-foreground/70">
          {description}
        </Text>

        {/* Hover effect */}
        <div className="absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      </Card>
    </div>
  );
}

export default function HowSection(): React.ReactElement {
  const { ref, isIntersecting } = useIntersectionObserver<HTMLElement>({
    threshold: 0.1,
    triggerOnce: true,
  });

  return (
    <section ref={ref} className="py-20">
      <div className="container mx-auto px-4 md:px-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <VStack className="text-center mb-12">
            <HStack className="inline-flex items-center gap-2 mb-4">
              <HiSparkles className="h-6 w-6 text-primary" />
              <Text className="text-sm font-semibold uppercase tracking-wide text-primary">
                How It Works
              </Text>
            </HStack>
            <Heading as="h2" className="text-3xl sm:text-4xl font-bold mb-4">
              Create Smarter, Not Harder
            </Heading>
            <Text
              as="p"
              className="text-lg text-foreground/70 max-w-2xl mx-auto"
            >
              Three steps to content that performs. No guesswork, no wasted
              effort.
            </Text>
          </VStack>

          {/* Steps */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {isIntersecting &&
              HOW_STEPS.map((step, index) => (
                <HowStep key={step.title} {...step} delay={index * 150} />
              ))}
          </div>

          {/* Connecting line (desktop only) */}
          <div className="hidden md:block relative mt-8">
            <div className="absolute inset-x-0 top-1/2 h-0.5 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          </div>
        </div>
      </div>
    </section>
  );
}
