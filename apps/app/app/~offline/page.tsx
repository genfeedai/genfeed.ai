import type { Metadata } from 'next';
import { Suspense } from 'react';
import OfflineContent from './content';

export const metadata: Metadata = {
  robots: {
    index: false,
  },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <OfflineContent />
    </Suspense>
  );
}
