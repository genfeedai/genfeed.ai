import type { VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../lib/utils';
import { ddVariants, dlVariants, dtVariants } from './definition-list.variants';

export interface DefinitionListProps
  extends HTMLAttributes<HTMLDListElement>,
    VariantProps<typeof dlVariants> {
  ref?: React.Ref<HTMLDListElement>;
}

export interface DefinitionTermProps
  extends HTMLAttributes<HTMLElement>,
    VariantProps<typeof dtVariants> {
  ref?: React.Ref<HTMLElement>;
}

export interface DefinitionDetailProps
  extends HTMLAttributes<HTMLElement>,
    VariantProps<typeof ddVariants> {
  ref?: React.Ref<HTMLElement>;
}

function DefinitionList({
  ref,
  className,
  variant,
  ...props
}: DefinitionListProps) {
  return (
    <dl
      ref={ref}
      className={cn(dlVariants({ variant }), className)}
      {...props}
    />
  );
}
DefinitionList.displayName = 'DefinitionList';

function DefinitionTerm({
  ref,
  className,
  variant,
  ...props
}: DefinitionTermProps) {
  return (
    <dt
      ref={ref as React.Ref<HTMLElement>}
      className={cn(dtVariants({ variant }), className)}
      {...props}
    />
  );
}
DefinitionTerm.displayName = 'DefinitionTerm';

function DefinitionDetail({
  ref,
  className,
  variant,
  ...props
}: DefinitionDetailProps) {
  return (
    <dd
      ref={ref as React.Ref<HTMLElement>}
      className={cn(ddVariants({ variant }), className)}
      {...props}
    />
  );
}
DefinitionDetail.displayName = 'DefinitionDetail';

export { DefinitionDetail, DefinitionList, DefinitionTerm };
