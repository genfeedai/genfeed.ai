'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import Link from 'next/link';
import { HiArrowLeft } from 'react-icons/hi2';

interface SidebarBackRowProps {
  label: string;
  href: string;
}

export default function SidebarBackRow({ label, href }: SidebarBackRowProps) {
  return (
    <div className="px-3 pt-2 pb-1 flex-shrink-0">
      <Link
        href={href}
        className={cn(
          'flex w-full items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-200 group',
          'text-white/80 hover:bg-white/[0.04]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
        )}
        aria-label={`Back to ${label}`}
      >
        <HiArrowLeft className="w-4 h-4 text-white/60 group-hover:text-white transition-colors duration-200" />
        <span className="text-sm font-medium text-white/90">{label}</span>
      </Link>
    </div>
  );
}
