'use client';

import { ModelsProvider } from '@contexts/models/models-context/models-context';
import type { LayoutProps } from '@props/layout/layout.props';
import { Suspense } from 'react';

export default function ModelsLayout({ children }: LayoutProps) {
  return (
    <ModelsProvider>
      <Suspense fallback={null}>{children}</Suspense>
    </ModelsProvider>
  );
}
