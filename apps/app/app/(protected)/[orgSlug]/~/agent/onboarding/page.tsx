'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import Link from 'next/link';
import { AgentWorkspacePageShell } from '../AgentWorkspacePageShell';

export default function ChatOnboardingPage() {
  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] flex-1 flex-col">
      <div className="pointer-events-none absolute right-4 top-3 z-10 flex justify-end">
        <Link
          href={APP_ROUTES.ONBOARDING.ROOT}
          className="pointer-events-auto rounded-full bg-background/70 px-3 py-1 text-xs text-muted-foreground shadow-border backdrop-blur transition hover:text-foreground"
        >
          Prefer a form? Use the classic setup
        </Link>
      </div>
      <AgentWorkspacePageShell />
    </div>
  );
}
