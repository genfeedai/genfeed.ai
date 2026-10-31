import type { ReactNode } from 'react';
import { Suspense } from 'react';
import AgentSettingsShell from './agent-settings-shell';

export default function BrandAgentSettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <AgentSettingsShell>{children}</AgentSettingsShell>
    </Suspense>
  );
}
