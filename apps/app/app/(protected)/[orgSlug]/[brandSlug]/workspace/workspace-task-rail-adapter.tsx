import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { WorkspaceTaskRailAdapterProps } from '@props/workspace/workspace-task-inspector.props';
import { Button } from '@ui/primitives/button';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useWorkspaceInspector } from '@/components/workspace-shell/WorkspaceInspectorContext';
import {
  type ProductWorkspaceSurfaceAdapter,
  useRegisterWorkspaceSurfaceAdapter,
  useRegisterWorkspaceSurfacePresentationAdapter,
  type WorkspaceSurfacePresentationAdapter,
} from '@/components/workspace-shell/WorkspaceSurfaceAdapterContext';
import { dispatchOpenContextTab } from '@/lib/workspace/agent-composer-events';
import { WorkspaceTaskDetail } from './workspace-task-inspector';

/**
 * Projects the task selected from `/workspace/inbox` into the shared rail,
 * the same way the tasks page and the library project their own selection.
 * The rendered detail carries a small close affordance (the Sheet it replaces
 * had its own); clicking it calls `onClose`, which clears the selection and
 * the `?taskId=` search param.
 */
export function WorkspaceTaskRailAdapter({
  busyTaskId,
  onApprove,
  onClose,
  onDismiss,
  onKeepOutput,
  onPlanNextSteps,
  onRequestChanges,
  onTrashOutput,
  onUnkeepOutput,
  task,
}: WorkspaceTaskRailAdapterProps) {
  const translate = useTranslations('pages.tasks.inspector');
  const { brandId, organizationId } = useBrand();
  const inspector = useWorkspaceInspector();
  const setInspectorOpen = inspector?.setIsOpen;
  const previousTaskIdRef = useRef<string | null>(null);

  // Open the rail when a *different* task is selected; never fight a collapse.
  useEffect(() => {
    const nextId = task?.id ?? null;
    const previousId = previousTaskIdRef.current;
    previousTaskIdRef.current = nextId;
    if (!nextId || nextId === previousId || !setInspectorOpen) return;
    setInspectorOpen(true);
    dispatchOpenContextTab();
  }, [task?.id, setInspectorOpen]);

  const inspectorNode = useMemo(
    () =>
      task ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <Button
            aria-label={translate('close')}
            className="absolute right-3 top-3 z-10"
            onClick={onClose}
            size={ButtonSize.ICON}
            variant={ButtonVariant.GHOST}
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
          <WorkspaceTaskDetail
            key={task.id}
            busyTaskId={busyTaskId}
            onApprove={onApprove}
            onDismiss={onDismiss}
            onKeepOutput={onKeepOutput}
            onPlanNextSteps={onPlanNextSteps}
            onRequestChanges={onRequestChanges}
            onTrashOutput={onTrashOutput}
            onUnkeepOutput={onUnkeepOutput}
            task={task}
          />
        </div>
      ) : (
        <p
          className="px-4 py-6 text-sm text-foreground/55"
          data-testid="workspace-task-inspector"
        >
          {translate('empty')}
        </p>
      ),
    [
      busyTaskId,
      onApprove,
      onClose,
      onDismiss,
      onKeepOutput,
      onPlanNextSteps,
      onRequestChanges,
      onTrashOutput,
      onUnkeepOutput,
      task,
      translate,
    ],
  );
  const renderInspector = useCallback(() => inspectorNode, [inspectorNode]);
  const contextLabel = task ? `Tasks · ${task.title}` : 'Tasks';

  const registration = useMemo<ProductWorkspaceSurfaceAdapter>(
    () => ({
      contextLabel,
      references: [],
      renderInspector,
      scope: {
        ...(brandId ? { brandId } : {}),
        organizationId: organizationId ?? '',
      },
      surfaceKey: 'workspace',
    }),
    [brandId, contextLabel, organizationId, renderInspector],
  );
  const presentation = useMemo<WorkspaceSurfacePresentationAdapter>(
    () => ({ contextLabel, inspector: inspectorNode, surfaceKey: 'workspace' }),
    [contextLabel, inspectorNode],
  );

  useRegisterWorkspaceSurfaceAdapter(registration);
  useRegisterWorkspaceSurfacePresentationAdapter(presentation);

  return null;
}
