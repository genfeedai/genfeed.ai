import type { Metadata } from 'next';
import { Suspense } from 'react';
import LocalDesktopContent from './content';

export const metadata: Metadata = {
  robots: { index: false },
  title: 'Local workspace',
};

export default function LocalDesktopPage() {
  return (
    <Suspense fallback={null}>
      <LocalDesktopContent />
    </Suspense>
  );
}
