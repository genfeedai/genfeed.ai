'use client';

import { cn } from '@helpers/formatting/cn/cn.util';

const PARTICLES = [
  'left-4 top-3',
  'left-10 top-1',
  'left-20 top-2',
  'right-16 top-3',
  'right-8 top-6',
  'left-8 bottom-4',
  'left-24 bottom-2',
  'right-24 bottom-3',
  'right-10 bottom-5',
];

export default function StreakCelebrationBurst({
  isVisible,
  className,
}: {
  isVisible: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden',
        className,
      )}
      aria-hidden="true"
    >
      {PARTICLES.map((position, index) => (
        <span
          key={`${position}-${index}`}
          className={cn(
            'absolute h-2.5 w-2.5 rounded-full bg-orange-300/80 opacity-0',
            position,
            isVisible && 'animate-ping',
          )}
          style={{
            animationDelay: `${index * 90}ms`,
            animationDuration: '1100ms',
          }}
        />
      ))}
    </div>
  );
}
