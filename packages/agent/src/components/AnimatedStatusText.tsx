import { cn } from '@helpers/formatting/cn/cn.util';
import type { ReactElement } from 'react';

interface AnimatedStatusTextProps {
  className?: string;
  text: string;
}

export function AnimatedStatusText({
  className,
  text,
}: AnimatedStatusTextProps): ReactElement {
  return (
    <span
      role="status"
      aria-label={text}
      className={cn(
        'inline-flex flex-wrap items-center gap-[0.02em]',
        className,
      )}
    >
      {Array.from(text).map((character, index) => (
        <span
          key={`${character}-${index}`}
          className={cn(
            'inline-block motion-reduce:animate-none',
            character.trim().length > 0 && 'animate-pulse',
          )}
          style={{
            animationDelay: `${index * 55}ms`,
            animationDuration: '1.2s',
          }}
        >
          {character === ' ' ? '\u00A0' : character}
        </span>
      ))}
    </span>
  );
}
