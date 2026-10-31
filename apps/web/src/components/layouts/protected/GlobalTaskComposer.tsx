'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { normalizeProtectedPathname } from '@/lib/navigation/operator-shell';
import {
  consumeOpenTaskComposerRequest,
  OPEN_TASK_COMPOSER_EVENT,
} from '@/lib/workspace/task-composer-events';

const WorkspaceTaskComposer = dynamic(
  () =>
    import(
      '@app/(protected)/[orgSlug]/[brandSlug]/workspace/workspace-task-composer'
    ).then((module) => module.WorkspaceTaskComposer),
  { ssr: false },
);

function isWorkspaceInboxPath(pathname: string | null): boolean {
  const normalized = normalizeProtectedPathname(pathname);
  return (
    normalized === APP_ROUTES.WORKSPACE.INBOX ||
    normalized.startsWith(`${APP_ROUTES.WORKSPACE.INBOX}/`)
  );
}

/**
 * The inbox page already mounts this composer and updates its own list.
 * Everywhere else the shell owns it, so New Task stays a note on the
 * current page.
 */
export default function GlobalTaskComposer() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const isInbox = isWorkspaceInboxPath(pathname);

  useEffect(() => {
    if (isInbox || typeof window === 'undefined') {
      return;
    }

    const openFromEvent = () => {
      consumeOpenTaskComposerRequest();
      setIsOpen(true);
    };
    const openPending = () => {
      if (consumeOpenTaskComposerRequest()) {
        setIsOpen(true);
      }
    };

    window.addEventListener(OPEN_TASK_COMPOSER_EVENT, openFromEvent);
    openPending();

    return () => {
      window.removeEventListener(OPEN_TASK_COMPOSER_EVENT, openFromEvent);
    };
  }, [isInbox]);

  if (isInbox || !isOpen) {
    return null;
  }

  return (
    <WorkspaceTaskComposer
      open={isOpen}
      onOpenChange={setIsOpen}
      onTaskCreated={() => undefined}
    />
  );
}
