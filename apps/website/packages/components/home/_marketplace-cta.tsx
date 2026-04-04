'use client';

import { ButtonSize } from '@genfeedai/enums';
import { useDelayedVisibility } from '@hooks/ui/use-delayed-visibility';
import { useIntersectionObserver } from '@hooks/ui/use-intersection-observer/use-intersection-observer';
import { EnvironmentService } from '@services/core/environment.service';
import { HStack } from '@ui/layout/stack';
import AppLink from '@ui/navigation/link/Link';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import {
  HiArrowRight,
  HiDocumentText,
  HiMusicalNote,
  HiPhoto,
  HiSparkles,
  HiVideoCamera,
} from 'react-icons/hi2';

interface FloatingCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: string;
  color: string;
  position: string;
  delay: number;
}

function FloatingCard({
  icon: Icon,
  label,
  count,
  color,
  position,
  delay,
}: FloatingCardProps) {
  const visible = useDelayedVisibility({ delay });

  return (
    <div
      className={`absolute ${position} transition-all duration-700 hidden lg:block ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      <div className="p-4 bg-card/80 backdrop-blur-sm border border-edge/[0.08] shadow-lg hover:shadow-xl transition-all hover:scale-105">
        <div className="flex items-center gap-3">
          <div className={`p-2 ${color}`}>
            <Icon className="h-5 w-5 text-surface" />
          </div>
          <div>
            <div className="text-xl font-bold">{count}</div>
            <div className="text-xs text-foreground/60">{label}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const FLOATING_CARDS: FloatingCardProps[] = [
  {
    color: 'bg-red-500',
    count: '500+',
    delay: 200,
    icon: HiVideoCamera,
    label: 'AI Videos',
    position: 'top-20 left-[10%]',
  },
  {
    color: 'bg-blue-500',
    count: '1.2K+',
    delay: 400,
    icon: HiPhoto,
    label: 'AI Images',
    position: 'top-32 right-[8%]',
  },
  {
    color: 'bg-purple-500',
    count: '200+',
    delay: 600,
    icon: HiMusicalNote,
    label: 'Music',
    position: 'bottom-24 left-[12%]',
  },
  {
    color: 'bg-green-500',
    count: '800+',
    delay: 800,
    icon: HiDocumentText,
    label: 'Articles',
    position: 'bottom-20 right-[10%]',
  },
];

const CATEGORY_PILLS = [
  { icon: HiVideoCamera, label: 'Videos', path: 'videos' },
  { icon: HiPhoto, label: 'Images', path: 'images' },
  { icon: HiMusicalNote, label: 'Music', path: 'musics' },
  { icon: HiDocumentText, label: 'Articles', path: 'posts' },
] as const;

export default function MarketplaceCTA() {
  const { ref, isIntersecting } = useIntersectionObserver<HTMLElement>({
    threshold: 0.3,
    triggerOnce: true,
  });

  return (
    <section
      ref={ref}
      className="py-24 bg-gradient-to-b from-background to-muted relative overflow-hidden"
    >
      {/* Background elements */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(var(--primary-rgb),0.1)_0%,transparent_70%)]" />

      {/* Floating cards */}
      {isIntersecting &&
        FLOATING_CARDS.map((card) => (
          <FloatingCard key={card.label} {...card} />
        ))}

      <div className="container mx-auto px-4 md:px-8 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <HStack className="inline-flex items-center gap-2 mb-4">
            <div className="relative">
              <div className="absolute inset-0 bg-fill/30 blur-lg animate-pulse" />
              <HiSparkles className="relative h-6 w-6 text-surface" />
            </div>
            <Text className="text-xs font-bold uppercase tracking-widest text-surface/60">
              See What&apos;s Possible
            </Text>
          </HStack>

          <Heading
            as="h2"
            className="text-3xl sm:text-4xl md:text-5xl font-serif italic mb-4"
          >
            Browse the Marketplace
          </Heading>

          <Text
            as="p"
            className="text-lg text-foreground/60 mb-10 max-w-2xl mx-auto"
          >
            Explore thousands of AI-generated videos, images, music, and
            articles. Get inspired and start creating your own content.
          </Text>

          {/* Category pills */}
          <div className="flex flex-wrap justify-center gap-3 mb-12">
            {CATEGORY_PILLS.map((item) => (
              <a
                key={item.label}
                href={`${EnvironmentService.apps.marketplace}/${item.path}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card/50 border border-edge/[0.08] hover:border-edge/20 hover:bg-fill/5 transition-all"
              >
                <item.icon className="h-4 w-4 text-surface" />
                <Text className="text-xs font-bold uppercase tracking-wide">
                  {item.label}
                </Text>
              </a>
            ))}
          </div>

          <div className="flex justify-center">
            <AppLink
              url={EnvironmentService.apps.marketplace}
              label={
                <>
                  Explore Marketplace
                  <HiArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              }
              size={ButtonSize.PUBLIC}
              target="_blank"
              className="group"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
