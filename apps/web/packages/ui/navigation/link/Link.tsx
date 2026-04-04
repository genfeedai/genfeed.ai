'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { LinkProps } from '@props/ui/ui.props';
import { buttonVariants } from '@ui/primitives/button';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import Link from 'next/link';
import type { MouseEvent } from 'react';

export default function AppLink({
  url,
  label,
  icon,
  variant = ButtonVariant.SECONDARY,
  size,
  className = '',
  isLoading = false,
  tooltip,
  tooltipPosition = 'bottom',
  target,
  rel,
  onClick = () => {},
}: LinkProps) {
  const resolvedRel =
    rel ?? (target === '_blank' ? 'noopener noreferrer' : undefined);

  const linkElement = (
    <Link
      href={url}
      target={target}
      rel={resolvedRel}
      className={cn(buttonVariants({ size, variant }), className)}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        if (isLoading) {
          return e.preventDefault();
        }

        onClick(e);
      }}
    >
      {icon}
      {label}
    </Link>
  );

  // Wrap with tooltip if provided
  if (tooltip) {
    return (
      <SimpleTooltip
        label={tooltip}
        position={tooltipPosition}
        isDisabled={isLoading}
      >
        {linkElement}
      </SimpleTooltip>
    );
  }

  return linkElement;
}
