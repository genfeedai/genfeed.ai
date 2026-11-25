'use client';

import AgentAuthClaimFrame from './claim-frame';

/** What the prerendered shell shows before the page reads its search params. */
export default function AgentAuthClaimFallback() {
  return (
    <AgentAuthClaimFrame>
      <div aria-busy="true" className="min-h-32 w-full" />
    </AgentAuthClaimFrame>
  );
}
