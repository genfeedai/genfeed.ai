import { cva } from 'class-variance-authority';

/**
 * CVA badge variants with semantic color options
 * Uses harmonized dark-mode palette with subtle backgrounds and borders
 *
 * Note: Some variants are intentional semantic aliases:
 * - error/destructive (rose) - use based on context
 * - accent/purple (violet) - use based on context
 * - warning/amber (amber) - use based on context
 * - validated/operational (green) - use based on context
 */
export const badgeVariants = cva(
  'rounded-full border gap-2 px-2.5 py-0.5 text-xs font-medium normal-case tracking-normal shadow-none whitespace-nowrap',
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
        accent: 'bg-primary/15 text-primary border-primary/30',
        amber: 'bg-warning/10 text-warning border-warning/30',
        // Content type badges (categorical — distinguishing media kinds)
        audio: 'bg-warning/15 text-warning border-warning/30',
        avatar: 'bg-info/15 text-info border-info/30',
        blue: 'bg-info/15 text-info border-info/30',
        default: 'bg-primary/15 text-primary border-primary/30',
        destructive: 'bg-destructive/10 text-destructive border-destructive/30',
        // Semantic aliases routed through the canonical destructive token
        error: 'bg-destructive/10 text-destructive border-destructive/30',
        ghost: 'bg-tertiary text-muted-foreground border-border',
        gif: 'bg-info/15 text-info border-info/30',
        // Content type badges (categorical — distinguishing media kinds)
        image: 'bg-info/15 text-info border-info/30',
        info: 'bg-info/10 text-info border-info/30',
        multimodal: 'bg-primary/15 text-primary border-primary/30',
        operational: 'bg-success/10 text-success border-success/30',
        outline: 'border-border text-foreground bg-transparent',
        primary: 'bg-primary/15 text-primary border-primary/30',
        // Additional category colors
        purple: 'bg-primary/15 text-primary border-primary/30',
        secondary: 'bg-tertiary text-muted-foreground border-border',
        slate: 'bg-tertiary text-muted-foreground border-border',
        success: 'bg-success/10 text-success border-success/30',
        text: 'bg-success/10 text-success border-success/30',
        // Status badges routed through canonical semantic tokens
        validated: 'bg-success/10 text-success border-success/30',
        video: 'bg-primary/15 text-primary border-primary/30',
        voice: 'bg-warning/15 text-warning border-warning/30',
        warning: 'bg-warning/10 text-warning border-warning/30',
      },
    },
  },
);
