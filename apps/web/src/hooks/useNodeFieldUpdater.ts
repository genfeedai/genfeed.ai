import { useCallback } from 'react';
import type { WorkflowNodeData } from '@genfeedai/types';
import { selectUpdateNodeData } from '@/store/workflow/selectors';
import { useWorkflowStore } from '@/store/workflowStore';

/**
 * Returns a factory that creates memoized field-update callbacks for a given node.
 *
 * Usage:
 * ```ts
 * const createUpdater = useNodeFieldUpdater<UpscaleNodeData>(id);
 * const handleModelChange = createUpdater('model', (v) => v as UpscaleModel);
 * const handleFormatChange = createUpdater('outputFormat', (v) => v as 'jpg' | 'png');
 * ```
 *
 * The returned factory is stable (only changes when nodeId changes), so callers
 * should wrap each `createUpdater(...)` call in its own `useMemo`/`useCallback`
 * or call it at render time to produce stable handlers.
 */
export function useNodeFieldUpdater<T extends WorkflowNodeData>(nodeId: string) {
  const updateNodeData = useWorkflowStore(selectUpdateNodeData);

  return useCallback(
    <K extends keyof T>(field: K, transform?: (value: string) => T[K]) =>
      (value: string) => {
        updateNodeData<T>(nodeId, {
          [field]: transform ? transform(value) : value,
        } as Partial<T>);
      },
    [nodeId, updateNodeData]
  );
}
