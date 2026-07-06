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
        sm: 'px-2 py-0.5 text-[10px]',
      },
      variant: {
        // Harmonized dark-mode palette with subtle backgrounds
        accent: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
        amber: 'bg-warning/10 text-warning border-warning/30',
        // Content type badges (categorical — distinguishing media kinds)
        audio: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
        blue: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
        default: 'bg-primary/15 text-primary border-primary/30',
        destructive: 'bg-destructive/10 text-destructive border-destructive/30',
        // Semantic aliases routed through the canonical destructive token
        error: 'bg-destructive/10 text-destructive border-destructive/30',
        ghost: 'bg-white/5 text-muted-foreground border-white/[0.08]',
        // Content type badges (categorical — distinguishing media kinds)
        image: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        info: 'bg-info/10 text-info border-info/30',
        multimodal: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
        operational: 'bg-success/10 text-success border-success/30',
        outline: 'border-white/[0.08] text-foreground bg-transparent',
        primary: 'bg-primary/15 text-primary border-primary/30',
        // Additional category colors
        purple: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
        secondary: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
        slate: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
        success: 'bg-success/10 text-success border-success/30',
        text: 'bg-success/10 text-success border-success/30',
        // Status badges routed through canonical semantic tokens
        validated: 'bg-success/10 text-success border-success/30',
        video: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
        warning: 'bg-warning/10 text-warning border-warning/30',
      },
    },
  },
);
