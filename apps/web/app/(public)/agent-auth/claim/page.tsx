import type { Metadata } from 'next';
import { Suspense } from 'react';
import AgentAuthClaimFallback from './claim-fallback';
import AgentAuthClaimContent from './content';

export const metadata: Metadata = {
  robots: { index: false },
  title: 'Authorize Agent | Genfeed',
};

export default function AgentAuthClaimPage() {
  return (
    <Suspense fallback={<AgentAuthClaimFallback />}>
      <AgentAuthClaimContent />
    </Suspense>
  );
}
