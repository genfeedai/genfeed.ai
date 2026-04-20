'use client';

import type { LayoutProps } from '@genfeedai/props/layout/layout.props';

export default function GalleryLayout({ children }: LayoutProps) {
  return (
    <div className="flex min-h-screen">
      <main className="flex-1 min-h-screen overflow-x-hidden flex justify-center">
        {children}
      </main>
    </div>
  );
}
