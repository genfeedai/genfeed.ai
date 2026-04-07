'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import type { BreadcrumbProps } from '@props/navigation/breadcrumb.props';
import {
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  Breadcrumb as BreadcrumbRoot,
  BreadcrumbSeparator,
} from '@ui/primitives/breadcrumb';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment } from 'react';

function safeDecodeURIComponent(str: string): string {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

export default function Breadcrumb({
  segments,
  className = '',
}: BreadcrumbProps) {
  const pathname = usePathname();

  const pathSegments = pathname
    .split('/')
    .filter(Boolean)
    .map((part, index, arr) => ({
      href: `/${arr.slice(0, index + 1).join('/')}`,
      label: safeDecodeURIComponent(part.replace(/-/g, ' ')),
    }));

  const crumbs = segments ?? pathSegments;

  if (crumbs.length === 0) {
    return null;
  }

  return (
    <BreadcrumbRoot className={cn('mb-4', className)}>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <Fragment key={crumb.href}>
              <BreadcrumbItem className="capitalize">
                {isLast ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </BreadcrumbRoot>
  );
}
