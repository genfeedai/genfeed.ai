'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useNavigationPrefetch } from '@ui/navigation/prefetch/useNavigationPrefetch';
import Link from 'next/link';
import { HiArrowLeft } from 'react-icons/hi2';

interface SidebarBackRowProps {
  label: string;
  href: string;
}

export default function SidebarBackRow({ label, href }: SidebarBackRowProps) {
  const prefetchHref = useNavigationPrefetch(href);

  return (
    <div className="px-3 pt-2 pb-1 flex-shrink-0">
      <Link
        href={href}
        onFocus={prefetchHref}
        onMouseEnter={prefetchHref}
        className={cn(
          'flex w-full items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-200 group',
          'text-foreground/80 hover:bg-foreground/[0.04]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
        )}
        aria-label={`Back to ${label}`}
      >
        <HiArrowLeft className="size-4 text-foreground/60 group-hover:text-foreground transition-colors duration-200" />
        <span className="font-medium text-foreground/90">{label}</span>
      </Link>
    </div>
  );
}
