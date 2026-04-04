'use client';

import { CardVariant } from '@genfeedai/enums';
import { useDelayedVisibility } from '@hooks/ui/use-delayed-visibility';
import { useIntersectionObserver } from '@hooks/ui/use-intersection-observer/use-intersection-observer';
import Card from '@ui/card/Card';
import { VStack } from '@ui/layout/stack';
import { SectionHeader } from '@ui/sections/header';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import {
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineDevicePhoneMobile,
  HiOutlineExclamationTriangle,
} from 'react-icons/hi2';

interface ProblemCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  delay: number;
}

function ProblemCard({
  icon: Icon,
  label,
  description,
  delay,
}: ProblemCardProps) {
  const visible = useDelayedVisibility({ delay });

  return (
    <Card
      variant={CardVariant.DEFAULT}
      className={`transition-all duration-700 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
      bodyClassName="p-6"
    >
      <Heading
        as="h3"
        className="flex items-center gap-3 text-lg font-semibold mb-3"
      >
        <div className="p-2 bg-warning/10">
          <Icon className="h-5 w-5 text-warning" />
        </div>
        {label}
      </Heading>
      <Text as="p" className="text-foreground/60">
        {description}
      </Text>
    </Card>
  );
}

const PROBLEMS = [
  {
    description:
      'Creating videos, images, and posts takes hours. Editing, formatting, scheduling—it never ends.',
    icon: HiOutlineClock,
    label: 'Time sink',
  },
  {
    description:
      'Every platform wants different formats. Resize, reformat, re-upload. Repeat.',
    icon: HiOutlineDevicePhoneMobile,
    label: 'Platform fatigue',
  },
  {
    description: "Some posts hit, most don't. No time to analyze what works.",
    icon: HiOutlineExclamationTriangle,
    label: 'Inconsistent output',
  },
];

const SOLUTIONS = [
  {
    description: 'from a single prompt.',
    highlight: 'Generate multi-format content',
  },
  {
    description: "to each platform's requirements.",
    highlight: 'Auto-adapt',
  },
  {
    description: 'with one click.',
    highlight: 'Publish everywhere',
  },
];

export default function HomeProblem() {
  const { ref, isIntersecting } = useIntersectionObserver<HTMLElement>({
    threshold: 0.2,
    triggerOnce: true,
  });

  return (
    <section ref={ref} className="gen-section-spacing">
      <div className="container mx-auto px-4 md:px-8">
        <div className="max-w-6xl mx-auto">
          <SectionHeader
            title={
              <>
                Manual content creation is{' '}
                <span className="font-light italic">dead.</span>
              </>
            }
            description="Long live AI-powered workflows."
            size="lg"
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column - Problems */}
            <div className="space-y-6">
              {isIntersecting &&
                PROBLEMS.map((problem, index) => (
                  <ProblemCard
                    key={problem.label}
                    {...problem}
                    delay={index * 150}
                  />
                ))}
            </div>

            {/* Right Column - Solution */}
            <Card variant={CardVariant.WHITE} bodyClassName="p-8">
              <Heading as="h3" className="text-2xl font-serif mb-8">
                With <span className="font-light italic">Genfeed</span>
              </Heading>

              <VStack className="space-y-6">
                {SOLUTIONS.map((point) => (
                  <div key={point.highlight} className="flex items-start gap-4">
                    <HiOutlineCheckCircle className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                    <Text as="p" className="text-foreground/80">
                      <Text as="span" className="text-foreground font-semibold">
                        {point.highlight}
                      </Text>{' '}
                      {point.description}
                    </Text>
                  </div>
                ))}
              </VStack>

              <Text
                as="p"
                className="mt-8 text-foreground/60 text-sm leading-relaxed"
              >
                Stop context-switching between apps. Let AI handle the grunt
                work while you focus on ideas that matter.
              </Text>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
