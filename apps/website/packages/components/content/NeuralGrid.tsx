'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import type {
  CtaSectionProps,
  WebSectionProps,
} from '@props/website/neural-grid.props';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

/* ─── NeuralGrid ─── */

const neuralGridVariants = cva(
  'grid gap-px bg-fill/5 border border-edge/5 overflow-hidden',
  {
    defaultVariants: {
      columns: 3,
      radius: 'lg',
    },
    variants: {
      columns: {
        1: 'grid-cols-1',
        2: 'grid-cols-1 md:grid-cols-2',
        3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
        4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
        5: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5',
      },
      radius: {
        lg: '',
        xl: '',
      },
    },
  },
);

export interface NeuralGridProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof neuralGridVariants> {}

const NeuralGrid = forwardRef<HTMLDivElement, NeuralGridProps>(
  ({ className, columns, radius, ...props }, ref) => (
    <div
      className={cn(neuralGridVariants({ columns, radius }), className)}
      ref={ref}
      {...props}
    />
  ),
);
NeuralGrid.displayName = 'NeuralGrid';

/* ─── NeuralGridItem ─── */

const neuralGridItemVariants = cva(
  'bg-background group hover:bg-fill/[0.02] transition-colors',
  {
    defaultVariants: {
      align: 'left',
      padding: 'md',
    },
    variants: {
      align: {
        center: 'text-center',
        left: 'text-left',
      },
      inverted: {
        false: '',
        true: 'bg-inv hover:bg-inv/95',
      },
      padding: {
        lg: 'p-12',
        md: 'p-10',
        sm: 'p-6',
      },
    },
  },
);

export interface NeuralGridItemProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title'>,
    VariantProps<typeof neuralGridItemVariants> {
  /** Tier label like "01 / Quick Start" */
  tierLabel?: string;
  /** Optional icon component */
  icon?: React.ComponentType<{ className?: string }>;
  /** Item title */
  title?: ReactNode;
  /** Item description */
  description?: ReactNode;
}

const NeuralGridItem = forwardRef<HTMLDivElement, NeuralGridItemProps>(
  (
    {
      className,
      padding,
      align,
      inverted,
      tierLabel,
      icon: Icon,
      title,
      description,
      children,
      ...props
    },
    ref,
  ) => (
    <div
      className={cn(
        neuralGridItemVariants({ align, inverted, padding }),
        className,
      )}
      ref={ref}
      {...props}
    >
      {tierLabel && (
        <div
          className={cn(
            'text-xs font-black uppercase tracking-widest mb-6',
            inverted ? 'text-inv-fg/30' : 'text-surface/20',
          )}
        >
          {tierLabel}
        </div>
      )}
      {Icon && (
        <Icon
          className={cn(
            'h-8 w-8 mb-4 group-hover:text-surface transition-colors',
            inverted ? 'text-inv-fg/40' : 'text-surface/40',
          )}
        />
      )}
      {title && (
        <h3 className={cn('text-lg font-bold mb-2', inverted && 'text-inv-fg')}>
          {title}
        </h3>
      )}
      {description && (
        <p
          className={cn(
            'text-sm',
            inverted ? 'text-inv-fg/40' : 'text-surface/40',
          )}
        >
          {description}
        </p>
      )}
      {children}
    </div>
  ),
);
NeuralGridItem.displayName = 'NeuralGridItem';

/* ─── WebSection ─── */

const bgClasses = {
  bordered: 'border-t border-edge/5',
  default: '',
  subtle: 'bg-fill/[0.02]',
} as const;

const pyClasses = {
  lg: 'py-32',
  md: 'py-20',
  xl: 'py-40',
} as const;

const maxWidthClasses = {
  full: '',
  lg: 'max-w-5xl',
  md: 'max-w-4xl',
  sm: 'max-w-3xl',
  xl: 'max-w-6xl',
} as const;

const WebSection = forwardRef<HTMLElement, WebSectionProps>(
  (
    {
      className,
      bg = 'default',
      py = 'lg',
      maxWidth = 'lg',
      children,
      ...props
    },
    ref,
  ) => (
    <section
      className={cn(pyClasses[py], bgClasses[bg], className)}
      ref={ref}
      {...props}
    >
      <div className="container mx-auto px-6">
        <div
          className={cn(
            maxWidthClasses[maxWidth],
            maxWidth !== 'full' && 'mx-auto',
          )}
        >
          {children}
        </div>
      </div>
    </section>
  ),
);
WebSection.displayName = 'WebSection';

/* ─── CtaSection ─── */

const CtaSection = forwardRef<HTMLElement, CtaSectionProps>(
  (
    {
      className,
      title,
      description,
      bg = 'default',
      beforeButtons,
      children,
      ...props
    },
    ref,
  ) => (
    <section
      className={cn('py-40', bg === 'subtle' && 'bg-fill/[0.02]', className)}
      ref={ref}
      {...props}
    >
      <div className="container mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-6xl font-serif mb-10">{title}</h2>
          {description && (
            <p className="text-surface/40 text-xl mb-12 font-medium">
              {description}
            </p>
          )}
          {beforeButtons}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {children}
          </div>
        </div>
      </div>
    </section>
  ),
);
CtaSection.displayName = 'CtaSection';

export type {
  CtaSectionProps,
  WebSectionProps,
} from '@props/website/neural-grid.props';

export {
  CtaSection,
  NeuralGrid,
  NeuralGridItem,
  neuralGridItemVariants,
  neuralGridVariants,
  WebSection,
};
