'use client';

import { ButtonVariant, CardVariant } from '@genfeedai/enums';
import { useDelayedVisibility } from '@hooks/ui/use-delayed-visibility';
import { useIntersectionObserver } from '@hooks/ui/use-intersection-observer/use-intersection-observer';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import Link from 'next/link';
import { useState } from 'react';
import {
  HiArrowRight,
  HiCheckCircle,
  HiCodeBracket,
  HiServerStack,
  HiVideoCamera,
} from 'react-icons/hi2';

interface HighlightCardProps {
  color: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  features: string[];
  delay: number;
}

function HighlightCard({
  color,
  description,
  icon: Icon,
  label,
  features,
  delay,
}: HighlightCardProps) {
  const visible = useDelayedVisibility({ delay });
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Card
        variant={CardVariant.DEFAULT}
        className={`relative flex flex-col items-center gap-4 px-6 py-8 transition-all duration-700 hover:-translate-y-1 hover:border-primary/30 ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
        bodyClassName="p-0 flex flex-col items-center gap-4"
      >
        {/* Icon with animation */}
        <div className="relative">
          <div
            className={`absolute inset-0 bg-gradient-to-br ${color} opacity-30 blur-lg transition-all duration-300 ${
              isHovered ? 'scale-150' : 'scale-100'
            }`}
          />
          <div
            className={`relative p-4 bg-gradient-to-br ${color} transition-transform duration-300 ${
              isHovered ? 'scale-110 rotate-3' : ''
            }`}
          >
            <Icon className="h-8 w-8 text-surface" />
          </div>
        </div>

        <Heading
          as="h3"
          className="text-lg font-semibold text-foreground text-center"
        >
          {label}
        </Heading>
        <Text as="p" className="text-sm text-foreground/70 text-center">
          {description}
        </Text>

        {/* Features list */}
        <div className="w-full pt-4 border-t border-edge/[0.08]">
          <ul className="space-y-2">
            {features.map((feature, index) => (
              <li
                key={feature}
                className="flex items-center gap-2 text-sm text-foreground/60 transition-all duration-300"
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                <HiCheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  );
}

const HIGHLIGHTS: Omit<HighlightCardProps, 'delay'>[] = [
  {
    color: 'from-green-500 to-emerald-500',
    description: 'Full source code access. Deploy anywhere. No vendor lock-in.',
    features: ['MIT License', 'Community-driven', 'Self-host anywhere'],
    icon: HiCodeBracket,
    label: 'Open Source First',
  },
  {
    color: 'from-purple-500 to-pink-500',
    description:
      'Generate videos, images, avatars, and posts with 7+ AI models.',
    features: ['7+ AI models', 'Multi-format output', 'Batch generation'],
    icon: HiVideoCamera,
    label: 'AI-Powered Outputs',
  },
  {
    color: 'from-blue-500 to-cyan-500',
    description: 'Self-host on your servers. Own your data. Scale infinitely.',
    features: ['Docker ready', 'Data sovereignty', 'Infinite scale'],
    icon: HiServerStack,
    label: 'Your Infrastructure',
  },
];

export default function HomeValueProps() {
  const { ref, isIntersecting } = useIntersectionObserver<HTMLElement>({
    threshold: 0.2,
    triggerOnce: true,
  });

  return (
    <section ref={ref} className="py-20 bg-background/30">
      <div className="container mx-auto px-4 md:px-8">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          {isIntersecting &&
            HIGHLIGHTS.map((highlight, index) => (
              <HighlightCard
                key={highlight.label}
                {...highlight}
                delay={index * 150}
              />
            ))}
        </div>

        {/* See All Features Link */}
        <div className="text-center mt-12">
          <Button
            asChild
            variant={ButtonVariant.LINK}
            className="text-lg gap-2 group"
          >
            <Link href="/features">
              See all features
              <HiArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
