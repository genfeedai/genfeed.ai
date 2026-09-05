'use client';

import { useSidebarNavigation } from '@genfeedai/contexts/ui/sidebar-navigation-context';
import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PageHeaderProps } from '@genfeedai/props/layout/page-header.props';
import ContainerTitle from '@ui/layout/container-title/ContainerTitle';
import { Button } from '@ui/primitives/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function PageHeader({
  backLabel,
  backRoute,
  onBack,
  title,
  description,
  icon,
  actions,
  className,
}: PageHeaderProps) {
  const { hasCanonicalBreadcrumb } = useSidebarNavigation();

  const hasBackButton = Boolean(backLabel && (backRoute || onBack));
  const hasActions = Boolean(actions);

  return (
    <div
      className={cn(
        'flex items-center justify-between mb-6',
        hasBackButton && !hasActions ? 'justify-start' : '',
        className,
      )}
    >
      <div className="flex items-center gap-4">
        {hasBackButton &&
          (backRoute ? (
            <Button asChild variant={ButtonVariant.GHOST} withWrapper={false}>
              <Link href={backRoute}>
                <ArrowLeft className="size-4" />
                {backLabel}
              </Link>
            </Button>
          ) : (
            <Button
              label={backLabel}
              icon={<ArrowLeft className="size-4" />}
              variant={ButtonVariant.GHOST}
              onClick={onBack}
            />
          ))}

        <div className="flex-1">
          {hasCanonicalBreadcrumb ? (
            <h1 className="sr-only">{title}</h1>
          ) : icon ? (
            <ContainerTitle
              title={title}
              description={description}
              icon={icon}
            />
          ) : (
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              {description && (
                <p className="text-sm text-foreground/70 mt-1">{description}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {hasActions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
