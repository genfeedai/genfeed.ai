import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../lib/utils';

const dlVariants = cva('', {
  defaultVariants: { variant: 'default' },
  variants: {
    variant: {
      compact: 'space-y-2',
      default: 'space-y-3',
      grid: 'grid grid-cols-2 gap-y-2',
    },
  },
});

const dtVariants = cva('', {
  defaultVariants: { variant: 'default' },
  variants: {
    variant: {
      default: 'text-sm text-foreground/45',
      label: 'text-[10px] uppercase tracking-wider text-white/30',
      muted: 'text-xs text-muted-foreground',
    },
  },
});

const ddVariants = cva('', {
  defaultVariants: { variant: 'default' },
  variants: {
    variant: {
      default: 'text-sm text-foreground/80',
      inline: 'mt-0.5',
      value: 'text-right text-foreground/80',
    },
  },
});

export interface DefinitionListProps
  extends HTMLAttributes<HTMLDListElement>,
    VariantProps<typeof dlVariants> {}

export interface DefinitionTermProps
  extends HTMLAttributes<HTMLElement>,
    VariantProps<typeof dtVariants> {}

export interface DefinitionDetailProps
  extends HTMLAttributes<HTMLElement>,
    VariantProps<typeof ddVariants> {}

const DefinitionList = forwardRef<HTMLDListElement, DefinitionListProps>(
  ({ className, variant, ...props }, ref) => (
    <dl
      ref={ref}
      className={cn(dlVariants({ variant }), className)}
      {...props}
    />
  ),
);
DefinitionList.displayName = 'DefinitionList';

const DefinitionTerm = forwardRef<HTMLElement, DefinitionTermProps>(
  ({ className, variant, ...props }, ref) => (
    <dt
      ref={ref as React.Ref<HTMLElement>}
      className={cn(dtVariants({ variant }), className)}
      {...props}
    />
  ),
);
DefinitionTerm.displayName = 'DefinitionTerm';

const DefinitionDetail = forwardRef<HTMLElement, DefinitionDetailProps>(
  ({ className, variant, ...props }, ref) => (
    <dd
      ref={ref as React.Ref<HTMLElement>}
      className={cn(ddVariants({ variant }), className)}
      {...props}
    />
  ),
);
DefinitionDetail.displayName = 'DefinitionDetail';

export {
  DefinitionDetail,
  DefinitionList,
  DefinitionTerm,
  ddVariants,
  dlVariants,
  dtVariants,
};
