'use client';

import { toast } from '@genfeedai/ui/primitives/toaster';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { collectGeometryIssues } from '../lib/geometry';
import { useWorkflowStore } from '../stores/workflow';
import { useGeometryEditorStore } from './geometryEditorStore';
import { useGeometryMessages } from './useGeometryMessages';

/**
 * Returns a check to run before executing: true when every annotation and motion node has valid
 * geometry. On a problem it names the first one and the node it is in, and marks that a run was
 * tried so an empty path shows its error too. Pass a node id to check only that node.
 */
export function useGeometryRunGuard(): (nodeId?: string) => boolean {
  const translate = useTranslations('pages.workflows.nodeControls');
  const { describeIssue } = useGeometryMessages();

  return useCallback(
    (nodeId?: string) => {
      const nodes = useWorkflowStore.getState().nodes;
      const issues = collectGeometryIssues(
        nodeId ? nodes.filter((node) => node.id === nodeId) : nodes,
      );
      if (issues.length === 0) {
        return true;
      }
      useGeometryEditorStore.getState().markRunAttempted();
      const [first] = issues;
      const title = translate(
        first.nodeType === 'annotation' ? 'annotation.title' : 'motion.title',
      );
      const message = `${title}: ${describeIssue(first)}`;
      toast.error(
        translate('runBlocked', {
          message:
            issues.length > 1
              ? translate('moreIssues', {
                  count: issues.length - 1,
                  first: message,
                })
              : message,
        }),
      );
      return false;
    },
    [describeIssue, translate],
  );
}
