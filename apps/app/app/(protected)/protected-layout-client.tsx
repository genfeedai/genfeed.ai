'use client';

import AppProtectedLayout from '@app-components/app-protected-layout';
import { FeatureFlagProvider } from '@hooks/feature-flags/provider';
import type { ProtectedBootstrapProps } from '@props/layout/protected-bootstrap.props';
import { ErrorBoundary } from '@ui/error';
import { useConversationShellRollout } from '@/lib/workspace-shell/use-conversation-shell-rollout';

export default function ProtectedLayoutClient({
  children,
  initialBootstrap,
}: ProtectedBootstrapProps) {
  const rollout = useConversationShellRollout();

  return (
    <FeatureFlagProvider
      overrides={{ conversation_shell: rollout.evaluation?.isEnabled === true }}
      ready={rollout.isReady}
    >
      <AppProtectedLayout initialBootstrap={initialBootstrap}>
        <ErrorBoundary>{children}</ErrorBoundary>
      </AppProtectedLayout>
    </FeatureFlagProvider>
  );
}
