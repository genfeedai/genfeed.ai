import type { Metadata } from 'next';
import { Suspense } from 'react';
import ManagedCreditsSuccessContent from './success-content';

export const metadata: Metadata = {
  title: 'Credits Added | Genfeed',
};

export default function ManagedCreditsSuccessPage() {
  return (
    <Suspense fallback={null}>
      <ManagedCreditsSuccessContent />
    </Suspense>
  );
}
