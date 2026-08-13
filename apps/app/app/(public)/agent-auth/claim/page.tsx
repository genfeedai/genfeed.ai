import type { Metadata } from 'next';
import { Suspense } from 'react';
import AgentAuthClaimContent from './content';

export const metadata: Metadata = {
  robots: { index: false },
  title: 'Authorize Agent | Genfeed',
};

export default function AgentAuthClaimPage() {
  return (
    <Suspense fallback={null}>
      <AgentAuthClaimContent />
    </Suspense>
  );
}
