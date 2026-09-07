import { cva } from 'class-variance-authority';

/**
 * CVA badge variants with semantic color options
 * Uses harmonized dark-mode palette with soft tinted backgrounds and no border ring
 *
 * Note: Some variants are intentional semantic aliases:
 * - error/destructive (rose) - use based on context
 * - accent/purple (violet) - use based on context
 * - warning/amber (amber) - use based on context
 * - validated/operational (green) - use based on context
 */
export const badgeVariants = cva(
  'rounded-full gap-2 px-2.5 py-0.5 text-xs font-medium normal-case tracking-normal shadow-none whitespace-nowrap',
  {
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
    variants: {
      size: {
        default: 'px-2.5 py-0.5 text-xs',
        lg: 'px-3 py-1 text-sm',
        sm: 'px-2 py-0.5 text-2xs',
      },
      variant: {
        // Harmonized dark-mode palette with subtle backgrounds
        accent: 'bg-primary/15 text-primary',
        amber: 'bg-warning/10 text-warning',
        // Content type badges (categorical — distinguishing media kinds)
        audio: 'bg-warning/15 text-warning',
        avatar: 'bg-info/15 text-info',
        blue: 'bg-info/15 text-info',
        default: 'bg-primary/15 text-primary',
        destructive: 'bg-destructive/10 text-destructive',
        // Semantic aliases routed through the canonical destructive token
        error: 'bg-destructive/10 text-destructive',
        ghost: 'bg-tertiary text-muted-foreground',
        gif: 'bg-info/15 text-info',
        // Content type badges (categorical — distinguishing media kinds)
        image: 'bg-info/15 text-info',
        info: 'bg-info/10 text-info',
        multimodal: 'bg-primary/15 text-primary',
        operational: 'bg-success/10 text-success',
        outline: 'border-border text-foreground bg-transparent',
        primary: 'bg-primary/15 text-primary',
        // Additional category colors
        purple: 'bg-primary/15 text-primary',
        secondary: 'bg-tertiary text-muted-foreground',
        slate: 'bg-tertiary text-muted-foreground',
        success: 'bg-success/10 text-success',
        text: 'bg-success/10 text-success',
        // Status badges routed through canonical semantic tokens
        validated: 'bg-success/10 text-success',
        video: 'bg-primary/15 text-primary',
        voice: 'bg-warning/15 text-warning',
        warning: 'bg-warning/10 text-warning',
      },
    },
  },
);
