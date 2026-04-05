'use client';

import type { ReactNode } from 'react';
import { Suspense } from 'react';

export interface PageSuspenseBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

export default function PageSuspenseBoundary({
  children,
  fallback,
}: PageSuspenseBoundaryProps) {
  return <Suspense fallback={fallback}>{children}</Suspense>;
}
