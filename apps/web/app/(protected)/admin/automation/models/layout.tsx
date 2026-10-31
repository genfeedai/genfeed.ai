'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import { Suspense } from 'react';

export default function ModelsLayout({ children }: LayoutProps) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
