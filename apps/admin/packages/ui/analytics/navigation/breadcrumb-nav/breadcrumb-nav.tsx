'use client';

import Link from 'next/link';
import { HiChevronRight } from 'react-icons/hi2';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbNavProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function BreadcrumbNav({ items, className = '' }: BreadcrumbNavProps) {
  return (
    <nav
      className={`flex items-center gap-2 text-sm ${className}`}
      aria-label="Breadcrumb"
    >
      <ol className="flex items-center gap-2">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={index} className="flex items-center gap-2">
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="text-primary hover:text-primary-focus transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={
                    isLast
                      ? 'text-foreground font-medium'
                      : 'text-foreground/60'
                  }
                >
                  {item.label}
                </span>
              )}
              {!isLast && (
                <HiChevronRight className="w-4 h-4 text-foreground/40" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
