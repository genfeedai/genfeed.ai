'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import { useIntersectionObserver } from '@hooks/ui/use-intersection-observer/use-intersection-observer';
import { HStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import type { ComponentType } from 'react';
import {
  HiArrowsPointingOut,
  HiCubeTransparent,
  HiSparkles,
  HiSquaresPlus,
  HiVideoCamera,
} from 'react-icons/hi2';

interface FeatureCard {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  span: string;
  inverted?: boolean;
}

const FEATURES: FeatureCard[] = [
  {
    description:
      'State-of-the-art models for images, video, and motion. One prompt unlocks every creative format with intelligent parameter tuning.',
    icon: HiSparkles,
    span: 'md:col-span-2 md:row-span-2',
    title: 'AI Generation',
  },
  {
    description:
      'Enhance any output to production-ready resolution with intelligent detail synthesis.',
    icon: HiArrowsPointingOut,
    span: '',
    title: '4K Upscale',
  },
  {
    description:
      'From static to motion. Generate video clips with camera control and scene consistency.',
    icon: HiVideoCamera,
    span: '',
    title: 'Video Gen',
  },
  {
    description:
      'Generate content at scale. Dozens of variations from a single prompt template.',
    icon: HiSquaresPlus,
    span: '',
    title: 'Batch Create',
  },
  {
    description:
      'Access Flux, Stable Diffusion, Kling, and more — all in one workspace.',
    icon: HiCubeTransparent,
    inverted: true,
    span: '',
    title: '50+ Models',
  },
];

export default function HomeFeatures(): React.ReactElement {
  const { ref, isIntersecting } = useIntersectionObserver<HTMLElement>({
    threshold: 0.2,
    triggerOnce: true,
  });

  return (
    <section ref={ref} id="solutions" className="gen-section-spacing-lg">
      <div className="container mx-auto px-6">
        {/* Section header */}
        <HStack className="items-center gap-3 mb-3">
          <HiSparkles className="h-4 w-4 gen-icon" />
          <Text className="gen-label gen-text-accent">Capabilities</Text>
        </HStack>
        <Heading
          as="h2"
          className="text-4xl sm:text-5xl font-serif tracking-tighter mb-12"
        >
          Everything you need to{' '}
          <span className="font-light italic gen-text-heading">create.</span>
        </Heading>

        {/* Bento grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 grid-rows-auto md:grid-rows-2 gap-1.5">
          {isIntersecting &&
            FEATURES.map((feature, index) => {
              const Icon = feature.icon;
              const isLarge = index === 0;

              return (
                <div
                  key={feature.title}
                  className={cn(
                    'gen-card-spotlight p-8 transition-all duration-500 animate-gen-stagger-in',
                    feature.span,
                    feature.inverted ? 'gen-card-featured' : 'bg-fill/[0.02]',
                    isLarge && 'gen-vignette',
                  )}
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  <div className="relative z-10 h-full flex flex-col">
                    <div
                      className={cn(
                        'w-10 h-10 flex items-center justify-center mb-4 border',
                        feature.inverted
                          ? 'bg-inv-fg/10 border-inv-fg/20'
                          : 'gen-badge',
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-5 w-5',
                          feature.inverted ? 'text-inv-fg' : 'gen-icon',
                        )}
                      />
                    </div>

                    <Heading
                      as="h3"
                      className={cn(
                        'font-bold uppercase tracking-wider mb-3',
                        isLarge ? 'text-xl' : 'text-sm',
                        feature.inverted ? 'text-inv-fg' : 'text-surface/90',
                      )}
                    >
                      {feature.title}
                    </Heading>

                    <Text
                      as="p"
                      className={cn(
                        'leading-relaxed',
                        isLarge ? 'text-base' : 'text-sm',
                        feature.inverted ? 'text-inv-fg/70' : 'text-surface/40',
                      )}
                    >
                      {feature.description}
                    </Text>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </section>
  );
}
