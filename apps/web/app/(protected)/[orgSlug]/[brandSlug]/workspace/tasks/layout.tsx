'use client';

import TaskInspectorAdapter from '@app/(protected)/[orgSlug]/[brandSlug]/tasks/task-inspector-adapter';
import { TaskSelectionProvider } from '@app/(protected)/[orgSlug]/[brandSlug]/tasks/task-selection-context';
import type { LayoutProps } from '@props/layout/layout.props';

/**
 * The selected task renders in the shared workspace inspector rail, so the
 * selection provider and adapter sit on the layout above the list and detail
 * routes rather than inside the list itself.
 */
export default function TasksLayout({ children }: LayoutProps) {
  return (
    <TaskSelectionProvider>
      <TaskInspectorAdapter />
      {children}
    </TaskSelectionProvider>
  );
}
