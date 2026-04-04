'use client';

import { CardVariant } from '@genfeedai/enums';
import { useDelayedVisibility } from '@hooks/ui/use-delayed-visibility';
import { useIntersectionObserver } from '@hooks/ui/use-intersection-observer/use-intersection-observer';
import Card from '@ui/card/Card';
import { HStack, VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import Image from 'next/image';
import {
  HiCalendar,
  HiChartBar,
  HiCog6Tooth,
  HiPhoto,
  HiSparkles,
  HiVideoCamera,
} from 'react-icons/hi2';

interface FeatureItemProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  delay: number;
  color: string;
}

function FeatureItem({
  icon,
  title,
  description,
  delay,
  color,
}: FeatureItemProps) {
  const visible = useDelayedVisibility({ delay });

  return (
    <Card
      variant={CardVariant.DEFAULT}
      icon={icon}
      label={title}
      description={description}
      iconWrapperClassName={`p-2 ${color}`}
      iconClassName="w-5 h-5 text-surface"
      bodyClassName="p-4"
      className={`transition-all duration-500 ${
        visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'
      }`}
    />
  );
}

function BrowserMockup() {
  return (
    <div className="relative border border-edge/[0.08] overflow-hidden">
      {/* Browser chrome */}
      <div className="bg-card/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <div className="flex-1 mx-4">
            <div className="bg-muted/50 px-3 py-1.5 text-xs text-foreground/50 text-center">
              app.genfeed.ai
            </div>
          </div>
        </div>
      </div>

      {/* Browser content - gradient placeholder */}
      <div className="relative aspect-[16/10]">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 via-blue-500/20 to-cyan-500/20" />

        {/* Grid overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px]" />

        {/* Mock UI elements */}
        <div className="absolute inset-0 p-6">
          {/* Sidebar */}
          <div className="absolute left-0 top-0 bottom-0 w-16 bg-card/30 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-8 h-8 bg-primary/20" />
              <div className="w-8 h-8 bg-fill/10" />
              <div className="w-8 h-8 bg-fill/10" />
              <div className="w-8 h-8 bg-fill/10" />
            </div>
          </div>

          {/* Main content area */}
          <div className="ml-20 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="h-6 w-32 bg-fill/10" />
              <div className="h-8 w-24 bg-primary/30" />
            </div>

            {/* Content cards grid */}
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  alt: 'AI fashion content',
                  src: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&q=80&fit=crop',
                },
                {
                  alt: 'AI urban content',
                  src: 'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=300&q=80&fit=crop',
                },
                {
                  alt: 'AI product content',
                  src: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=300&q=80&fit=crop',
                },
              ].map((img) => (
                <div
                  key={img.alt}
                  className="aspect-[9/16] overflow-hidden relative"
                >
                  <Image
                    src={img.src}
                    alt={img.alt}
                    fill
                    sizes="(max-width: 768px) 33vw, 20vw"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>

            {/* Stats row */}
            <div className="flex gap-3">
              {['stat-1', 'stat-2', 'stat-3'].map((id) => (
                <div
                  key={id}
                  className="flex-1 h-16 bg-card/30 backdrop-blur-sm"
                />
              ))}
            </div>
          </div>
        </div>

        {/* Floating sparkle indicator */}
        <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/80 text-primary-foreground text-xs font-medium">
          <HiSparkles className="h-3 w-3" />
          AI Generating
        </div>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    color: 'bg-purple-500',
    delay: 200,
    description: 'Create videos from text prompts with multiple AI models',
    icon: HiVideoCamera,
    title: 'AI Video Generation',
  },
  {
    color: 'bg-blue-500',
    delay: 300,
    description: 'Generate stunning visuals for any platform',
    icon: HiPhoto,
    title: 'Image Creation',
  },
  {
    color: 'bg-green-500',
    delay: 400,
    description: 'Schedule and automate your publishing workflow',
    icon: HiCalendar,
    title: 'Content Calendar',
  },
  {
    color: 'bg-orange-500',
    delay: 500,
    description: 'Track performance across all your channels',
    icon: HiChartBar,
    title: 'Analytics Dashboard',
  },
];

export default function AppShowcase() {
  const { ref, isIntersecting } = useIntersectionObserver<HTMLElement>({
    threshold: 0.2,
    triggerOnce: true,
  });

  return (
    <section ref={ref} className="py-20 bg-background/50 overflow-hidden">
      <div className="container mx-auto px-4 md:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <VStack className="text-center mb-12">
            <HStack className="inline-flex items-center gap-2 mb-4">
              <HiCog6Tooth className="h-6 w-6 text-primary" />
              <Text className="text-sm font-semibold uppercase tracking-wide text-primary">
                The Platform
              </Text>
            </HStack>
            <Heading
              as="h2"
              className="text-3xl sm:text-4xl md:text-5xl font-serif italic mb-4 tracking-tight"
            >
              Your Content Command Center
            </Heading>
            <Text
              as="p"
              className="text-lg text-foreground/70 max-w-2xl mx-auto"
            >
              All your AI-generated content, scheduling, and analytics in one
              beautiful interface.
            </Text>
          </VStack>

          {/* Content */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12 items-center">
            {/* Browser mockup - takes 3 columns */}
            <div
              className={`lg:col-span-3 transition-all duration-700 ${
                isIntersecting
                  ? 'opacity-100 translate-y-0'
                  : 'opacity-0 translate-y-8'
              }`}
            >
              <BrowserMockup />
            </div>

            {/* Features - takes 2 columns */}
            <div className="lg:col-span-2 space-y-4">
              {isIntersecting &&
                FEATURES.map((feature) => (
                  <FeatureItem key={feature.title} {...feature} />
                ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
