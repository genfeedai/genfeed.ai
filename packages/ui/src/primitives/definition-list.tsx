import { cn } from '@genfeedai/helpers';
import type { VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import {
  ddVariants,
  dlVariants,
  dRowVariants,
  dtVariants,
} from './definition-list.variants';

export interface DefinitionListProps
  extends HTMLAttributes<HTMLDListElement>,
    VariantProps<typeof dlVariants> {
  ref?: React.Ref<HTMLDListElement>;
}

export interface DefinitionRowProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof dRowVariants> {
  ref?: React.Ref<HTMLDivElement>;
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
  columns,
  variant,
  ...props
}: DefinitionListProps) {
  return (
    <dl
      ref={ref}
      className={cn(dlVariants({ columns, variant }), className)}
      {...props}
    />
  );
}
DefinitionList.displayName = 'DefinitionList';

function DefinitionRow({
  ref,
  className,
  variant,
  ...props
}: DefinitionRowProps) {
  return (
    <div
      ref={ref}
      className={cn(dRowVariants({ variant }), className)}
      {...props}
    />
  );
}
DefinitionRow.displayName = 'DefinitionRow';

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

export { DefinitionDetail, DefinitionList, DefinitionRow, DefinitionTerm };
