'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import type { HeroSectionProps } from '@props/sections/hero.props';
import Link from 'next/link';
import { memo } from 'react';

const VARIANT_LAYOUT_CLASSES = {
  centered: 'flex flex-col items-center text-center max-w-4xl mx-auto',
  default: 'grid lg:grid-cols-2 gap-12 lg:gap-16 items-center',
  split: 'grid lg:grid-cols-2 gap-16 items-start',
} as const;

const VARIANT_TEXT_CLASSES = {
  centered: 'items-center',
  default: '',
  split: '',
} as const;

/**
 * HeroSection - A flexible hero section component
 * Supports default (side-by-side), centered, and split variants
 */
const HeroSection = memo(function HeroSection({
  badge,
  title,
  description,
  primaryCta,
  secondaryCta,
  showcase,
  variant = 'default',
  className,
}: HeroSectionProps) {
  return (
    <section
      className={cn(
        'gen-section-spacing-lg',
        VARIANT_LAYOUT_CLASSES[variant],
        className,
      )}
    >
      {/* Text Content */}
      <div className={cn('flex flex-col gap-6', VARIANT_TEXT_CLASSES[variant])}>
        {/* Badge */}
        {badge && (
          <span className="gen-label text-muted-foreground">{badge}</span>
        )}

        {/* Title */}
        <h1 className="gen-heading gen-heading-xl text-foreground">{title}</h1>

        {/* Description */}
        {description && (
          <p
            className={cn(
              'text-lg text-muted-foreground leading-relaxed',
              variant === 'centered' ? 'max-w-2xl' : 'max-w-xl',
            )}
          >
            {description}
          </p>
        )}

        {/* CTAs */}
        {(primaryCta || secondaryCta) && (
          <div
            className={cn(
              'flex gap-4 mt-4',
              variant === 'centered' && 'justify-center',
            )}
          >
            {primaryCta && (
              <Link
                href={primaryCta.href}
                {...(primaryCta.external && {
                  rel: 'noopener noreferrer',
                  target: '_blank',
                })}
                className={cn(
                  'px-8 py-4 rounded-full font-bold text-sm uppercase tracking-wider',
                  'bg-white text-black dark:bg-white dark:text-black',
                  'hover:scale-105 transition-all duration-300',
                )}
              >
                {primaryCta.label}
              </Link>
            )}
            {secondaryCta && (
              <Link
                href={secondaryCta.href}
                {...(secondaryCta.external && {
                  rel: 'noopener noreferrer',
                  target: '_blank',
                })}
                className={cn(
                  'px-8 py-4 rounded-full font-bold text-sm uppercase tracking-wider',
                  'border border-white/20 dark:border-white/20 text-foreground',
                  'hover:bg-white/5 dark:hover:bg-white/5 hover:border-white/30 dark:hover:border-white/30',
                  'transition-all duration-300',
                )}
              >
                {secondaryCta.label}
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Showcase */}
      {showcase && (
        <div className={cn(variant === 'centered' && 'mt-12 w-full')}>
          {showcase}
        </div>
      )}
    </section>
  );
});

export default HeroSection;
