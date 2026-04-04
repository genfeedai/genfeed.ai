'use client';

import { useAnimatedCounter } from '@hooks/ui/use-animated-counter/use-animated-counter';
import { useIntersectionObserver } from '@hooks/ui/use-intersection-observer/use-intersection-observer';
import type { StatItemProps } from '@props/website/home.props';

function StatItem({ end, suffix, label, index }: StatItemProps) {
  const { ref, value } = useAnimatedCounter({ duration: 2000, end, suffix });

  return (
    <div
      ref={ref}
      className="relative flex flex-col items-center text-center"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-surface">
        {value}
      </div>
      <div className="mt-1.5 text-[10px] sm:text-[11px] font-medium uppercase tracking-[0.15em] text-surface/40">
        {label}
      </div>
    </div>
  );
}

const STATS = [
  { end: 500, label: 'AI Videos', suffix: '+' },
  { end: 2, label: 'AI Images', suffix: 'K+' },
  { end: 100, label: 'Content Views', suffix: 'K+' },
  { end: 200, label: 'Active Creators', suffix: '+' },
] as const;

export default function HomeStats() {
  const { ref, isIntersecting } = useIntersectionObserver<HTMLElement>({
    threshold: 0.2,
    triggerOnce: true,
  });

  return (
    <section ref={ref} className="relative w-full">
      {/* Subtle background - just slightly darker than page */}
      <div className="absolute inset-0 bg-fill/[0.02]" />

      {/* Content */}
      <div className="relative py-12 sm:py-14">
        <div className="container mx-auto px-4 md:px-8">
          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-y-8 gap-x-6 max-w-4xl mx-auto">
            {isIntersecting &&
              STATS.map((stat, index) => (
                <StatItem key={stat.label} {...stat} index={index} />
              ))}
          </div>
        </div>
      </div>
    </section>
  );
}
